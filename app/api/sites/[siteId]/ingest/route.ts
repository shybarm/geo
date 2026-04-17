import { createHash } from "node:crypto";

import {
  PageLifecycleStatus,
  PageSourceStatus,
  PageVersionSource,
  PageVersionState,
  Prisma,
  SiteCrawlStatus,
  ScanTriggerType,
} from "@prisma/client";

import { createdResponse, errorResponse } from "@/lib/api";
import { createJobTimer, deriveJobStatus } from "@/lib/jobs";
import { runScansForPages } from "@/lib/job-runner";
import { normalizeUrl } from "@/lib/normalize-url";
import { prisma } from "@/lib/prisma";
import {
  tryFetchSitemapUrls,
  extractSitemapUrlsFromRobots,
  fetchRobotsTxt,
} from "@/lib/sitemap";

type RouteContext = {
  params: Promise<{ siteId: string }>;
};

function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function createContentHash(url: string, path: string) {
  return createHash("sha256").update(JSON.stringify({ url, path })).digest("hex");
}

function normalizeUrlSafe(input: string): string | null {
  try {
    return normalizeUrl(input).normalizedUrl;
  } catch {
    return null;
  }
}

type DiscoveryResult = {
  urls: string[];
  discoveryMethodUsed: string;
  attemptedSources: string[];
};

async function discoverUrls(domain: string, providedSitemapUrl?: string): Promise<DiscoveryResult> {
  const host = normalizeDomain(domain);
  const attemptedSources: string[] = [];

  // 1. Provided sitemap URL
  if (providedSitemapUrl) {
    attemptedSources.push(providedSitemapUrl);
    const urls = await tryFetchSitemapUrls(providedSitemapUrl);
    if (urls && urls.length > 0) {
      return { urls, discoveryMethodUsed: "provided_sitemap", attemptedSources };
    }
  }

  // 2. Standard /sitemap.xml
  const sitemapXmlUrl = `https://${host}/sitemap.xml`;
  if (!attemptedSources.includes(sitemapXmlUrl)) {
    attemptedSources.push(sitemapXmlUrl);
    const urls = await tryFetchSitemapUrls(sitemapXmlUrl);
    if (urls && urls.length > 0) {
      return { urls, discoveryMethodUsed: "sitemap_xml", attemptedSources };
    }
  }

  // 3. /sitemap_index.xml
  const sitemapIndexUrl = `https://${host}/sitemap_index.xml`;
  attemptedSources.push(sitemapIndexUrl);
  const indexUrls = await tryFetchSitemapUrls(sitemapIndexUrl);
  if (indexUrls && indexUrls.length > 0) {
    return { urls: indexUrls, discoveryMethodUsed: "sitemap_index_xml", attemptedSources };
  }

  // 4. robots.txt — extract Sitemap: directives
  const robotsUrl = `https://${host}/robots.txt`;
  attemptedSources.push(robotsUrl);
  const robotsText = await fetchRobotsTxt(host);
  if (robotsText) {
    const sitemapCandidates = extractSitemapUrlsFromRobots(robotsText);
    for (const candidateUrl of sitemapCandidates.slice(0, 5)) {
      if (!attemptedSources.includes(candidateUrl)) {
        attemptedSources.push(candidateUrl);
        const urls = await tryFetchSitemapUrls(candidateUrl);
        if (urls && urls.length > 0) {
          return { urls, discoveryMethodUsed: "robots_txt", attemptedSources };
        }
      }
    }
  }

  // 5. Homepage fallback — ingest at least the root URL
  const homepageUrl = `https://${host}/`;
  attemptedSources.push(homepageUrl);
  const normalized = normalizeUrlSafe(homepageUrl);
  if (normalized) {
    return { urls: [normalized], discoveryMethodUsed: "homepage_fallback", attemptedSources };
  }

  return { urls: [], discoveryMethodUsed: "none", attemptedSources };
}

export async function POST(request: Request, context: RouteContext) {
  const { siteId } = await context.params;
  const timer = createJobTimer();

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return errorResponse("Site not found.", 404);
  }

  const body = (await request.json().catch(() => ({}))) as { sitemapUrl?: unknown };
  const providedSitemapUrl =
    typeof body.sitemapUrl === "string" && body.sitemapUrl.trim()
      ? body.sitemapUrl.trim()
      : undefined;

  await prisma.site.update({
    where: { id: site.id },
    data: { crawlStatus: SiteCrawlStatus.RUNNING },
  });

  try {
    const discovery = await discoverUrls(site.domain, providedSitemapUrl);

    if (discovery.urls.length === 0) {
      await prisma.site.update({
        where: { id: site.id },
        data: { crawlStatus: SiteCrawlStatus.FAILED },
      });
      return errorResponse(
        `No pages discovered. Tried: ${discovery.attemptedSources.join(", ")}`,
        400,
      );
    }

    const now = new Date();

    const ingestResult = await prisma.$transaction(async (tx) => {
      let createdPageCount = 0;
      let createdVersionCount = 0;
      const scanTargetPageIds = new Set<string>();

      for (const discoveredUrl of discovery.urls) {
        let normalized;
        try {
          normalized = normalizeUrl(discoveredUrl);
        } catch {
          continue;
        }

        const contentHash = createContentHash(normalized.canonicalUrl, normalized.pathname);

        let page = await tx.page.findUnique({
          where: { siteId_path: { siteId: site.id, path: normalized.pathname } },
        });

        if (!page) {
          page = await tx.page.create({
            data: {
              workspaceId: site.workspaceId,
              siteId: site.id,
              url: normalized.normalizedUrl,
              canonicalUrl: normalized.canonicalUrl,
              path: normalized.pathname,
              slug: normalized.slug,
              title: null,
              pageType: null,
              lifecycleStatus: PageLifecycleStatus.ACTIVE,
              sourceStatus: PageSourceStatus.CRAWLED,
              existsLive: true,
              routeLastVerifiedAt: now,
            },
          });
          createdPageCount += 1;
        } else {
          page = await tx.page.update({
            where: { id: page.id },
            data: {
              url: normalized.normalizedUrl,
              canonicalUrl: normalized.canonicalUrl,
              path: normalized.pathname,
              slug: normalized.slug,
              existsLive: page.existsLive || Boolean(page.currentLivePageVersionId),
              routeLastVerifiedAt: page.routeLastVerifiedAt ?? now,
            },
          });
        }

        if (!page.currentLivePageVersionId) {
          const version = await tx.pageVersion.create({
            data: {
              pageId: page.id,
              contentState: PageVersionState.LIVE_SNAPSHOT,
              contentSource: PageVersionSource.CRAWL,
              contentHash,
              title: null,
              metaDescription: null,
              htmlBlobKey: null,
              markdownBlobKey: null,
              extractedJson: {
                url: normalized.normalizedUrl,
                path: normalized.pathname,
                source: "sitemap",
              } as Prisma.InputJsonValue,
              createdBy: "system",
            },
          });

          page = await tx.page.update({
            where: { id: page.id },
            data: {
              currentLivePageVersionId: version.id,
              existsLive: true,
              routeLastVerifiedAt: now,
            },
          });
          createdVersionCount += 1;
          scanTargetPageIds.add(page.id);
        }
      }

      return {
        discoveredCount: discovery.urls.length,
        createdPageCount,
        createdVersionCount,
        scanTargetPageIds: [...scanTargetPageIds],
      };
    });

    // Run scans via shared helper
    const scanBatch = await runScansForPages(
      site.workspaceId,
      ingestResult.scanTargetPageIds,
      ScanTriggerType.INITIAL_INGEST,
    );

    await prisma.site.update({
      where: { id: site.id },
      data: { crawlStatus: SiteCrawlStatus.COMPLETED },
    });

    const timing = timer.stop();
    const status = deriveJobStatus(scanBatch.completedCount, scanBatch.failedCount);
    const nextStep =
      scanBatch.failedCount > 0
        ? `${scanBatch.failedCount} scan(s) failed — open each page to rescan manually, or use /api/pages/re-audit.`
        : ingestResult.createdPageCount > 0
          ? "Review discovered pages and generate recommendations for scanned pages."
          : "Pages already up to date. Run a crawl to discover internal links.";

    return createdResponse({
      siteId: site.id,
      startedAt: timing.startedAt,
      completedAt: timing.completedAt,
      durationMs: timing.durationMs,
      status,
      discoveryMethodUsed: discovery.discoveryMethodUsed,
      attemptedSources: discovery.attemptedSources,
      discoveredCount: ingestResult.discoveredCount,
      createdPageCount: ingestResult.createdPageCount,
      createdVersionCount: ingestResult.createdVersionCount,
      completedScanCount: scanBatch.completedCount,
      failedScanCount: scanBatch.failedCount,
      nextStep,
    });
  } catch (error) {
    await prisma.site.update({
      where: { id: site.id },
      data: { crawlStatus: SiteCrawlStatus.FAILED },
    });

    if (error instanceof Error) {
      return errorResponse(error.message, 400);
    }

    return errorResponse("Failed to ingest site.", 500);
  }
}
