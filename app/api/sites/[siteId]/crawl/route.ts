import { createHash } from "node:crypto";

import {
  PageLifecycleStatus,
  PageSourceStatus,
  PageVersionSource,
  PageVersionState,
  Prisma,
  ScanTriggerType,
  SiteCrawlStatus,
} from "@prisma/client";

import { errorResponse, successResponse } from "@/lib/api";
import { mergeCrawlSourceMetadata } from "@/lib/crawl-source";
import { extractInternalLinks } from "@/lib/extract-internal-links";
import { fetchPage } from "@/lib/fetch-page";
import { createJobTimer, deriveJobStatus } from "@/lib/jobs";
import { applyPostScanCrawlMetadata, runScansForPages } from "@/lib/job-runner";
import { normalizeUrl } from "@/lib/normalize-url";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ siteId: string }>;
};

const DEFAULT_MAX_PAGES = 50;
const OUTBOUND_PATH_SAMPLE_LIMIT = 20;

type DiscoveredEntry = {
  normalizedUrl: string;
  canonicalUrl: string;
  pathname: string;
  slug: string;
  discoveredFromUrls: Set<string>;
  discoveredFromPaths: Set<string>;
};

function contentHash(url: string, path: string): string {
  return createHash("sha256").update(JSON.stringify({ url, path })).digest("hex");
}

export async function POST(request: Request, context: RouteContext) {
  const { siteId } = await context.params;
  const timer = createJobTimer();

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return errorResponse("Site not found.", 404);

  const body = (await request.json().catch(() => ({}))) as { maxPages?: unknown };
  const maxPages =
    typeof body.maxPages === "number" && body.maxPages > 0
      ? Math.min(body.maxPages, 200)
      : DEFAULT_MAX_PAGES;

  try {
    await prisma.site.update({
      where: { id: site.id },
      data: { crawlStatus: SiteCrawlStatus.RUNNING },
    });

    const sourcePages = await prisma.page.findMany({
      where: {
        siteId: site.id,
        lifecycleStatus: PageLifecycleStatus.ACTIVE,
        currentLivePageVersionId: { not: null },
      },
      select: {
        id: true,
        url: true,
        currentLivePageVersionId: true,
        currentLivePageVersion: {
          select: {
            extractedJson: true,
          },
        },
      },
    });

    const allDiscovered = new Map<string, DiscoveredEntry>();
    const sourcePageUpdates: Array<{
      pageVersionId: string;
      extractedJson: unknown;
      outboundInternalPaths: string[];
    }> = [];
    let crawledSourcePagesCount = 0;

    for (const sourcePage of sourcePages) {
      const result = await fetchPage(sourcePage.url);
      if (!result.ok) continue;

      crawledSourcePagesCount += 1;
      const sourceIdentity = normalizeUrl(result.finalUrl);
      const links = extractInternalLinks(result.html, result.finalUrl);
      const outboundInternalPaths = Array.from(
        new Set(
          links
            .map((link) => {
              try {
                return normalizeUrl(link).pathname;
              } catch {
                return null;
              }
            })
            .filter((value): value is string => value !== null),
        ),
      )
        .sort((a, b) => a.localeCompare(b))
        .slice(0, OUTBOUND_PATH_SAMPLE_LIMIT);

      if (sourcePage.currentLivePageVersionId) {
        sourcePageUpdates.push({
          pageVersionId: sourcePage.currentLivePageVersionId,
          extractedJson: sourcePage.currentLivePageVersion?.extractedJson ?? null,
          outboundInternalPaths,
        });
      }

      for (const link of links) {
        try {
          const normalized = normalizeUrl(link);
          const existing = allDiscovered.get(normalized.pathname);

          if (existing) {
            existing.discoveredFromUrls.add(sourceIdentity.normalizedUrl);
            existing.discoveredFromPaths.add(sourceIdentity.pathname);
          } else {
            allDiscovered.set(normalized.pathname, {
              normalizedUrl: normalized.normalizedUrl,
              canonicalUrl: normalized.canonicalUrl,
              pathname: normalized.pathname,
              slug: normalized.slug,
              discoveredFromUrls: new Set([sourceIdentity.normalizedUrl]),
              discoveredFromPaths: new Set([sourceIdentity.pathname]),
            });
          }
        } catch {
          // skip invalid urls
        }
      }
    }

    const discoveredInternalLinksCount = allDiscovered.size;
    const crawlCandidates = [...allDiscovered.values()]
      .sort((a, b) => a.pathname.localeCompare(b.pathname))
      .slice(0, maxPages);

    const now = new Date();
    const scanTargetPageIds = new Set<string>();
    const scanTargetMetadata = new Map<
      string,
      { discoveredFromUrls: string[]; discoveredFromPaths: string[] }
    >();
    let createdPageCount = 0;
    let createdVersionCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const sourcePageUpdate of sourcePageUpdates) {
        await tx.pageVersion.update({
          where: { id: sourcePageUpdate.pageVersionId },
          data: {
            extractedJson: mergeCrawlSourceMetadata(sourcePageUpdate.extractedJson, {
              outboundInternalPaths: sourcePageUpdate.outboundInternalPaths,
              outboundInternalLinkCount: sourcePageUpdate.outboundInternalPaths.length,
            }) as Prisma.InputJsonValue,
          },
        });
      }

      for (const candidate of crawlCandidates) {
        const discoveredFromUrls = [...candidate.discoveredFromUrls].sort((a, b) =>
          a.localeCompare(b),
        );
        const discoveredFromPaths = [...candidate.discoveredFromPaths].sort((a, b) =>
          a.localeCompare(b),
        );
        const hash = contentHash(candidate.canonicalUrl, candidate.pathname);

        const existing = await tx.page.findUnique({
          where: { siteId_path: { siteId: site.id, path: candidate.pathname } },
          select: {
            id: true,
            currentLivePageVersionId: true,
            existsLive: true,
            routeLastVerifiedAt: true,
            currentLivePageVersion: {
              select: {
                extractedJson: true,
              },
            },
          },
        });

        let pageId: string;
        let needsVersion = false;

        if (existing) {
          pageId = existing.id;

          await tx.page.update({
            where: { id: existing.id },
            data: {
              url: candidate.normalizedUrl,
              canonicalUrl: candidate.canonicalUrl,
              path: candidate.pathname,
              slug: candidate.slug,
              existsLive: existing.existsLive || Boolean(existing.currentLivePageVersionId),
              routeLastVerifiedAt: existing.routeLastVerifiedAt ?? now,
            },
          });

          if (existing.currentLivePageVersionId) {
            await tx.pageVersion.update({
              where: { id: existing.currentLivePageVersionId },
              data: {
                extractedJson: mergeCrawlSourceMetadata(
                  existing.currentLivePageVersion?.extractedJson ?? null,
                  {
                    source: "internal-crawl",
                    discoveredFromUrls,
                    discoveredFromPaths,
                  },
                ) as Prisma.InputJsonValue,
              },
            });
          } else {
            needsVersion = true;
          }
        } else {
          const page = await tx.page.create({
            data: {
              workspaceId: site.workspaceId,
              siteId: site.id,
              url: candidate.normalizedUrl,
              canonicalUrl: candidate.canonicalUrl,
              path: candidate.pathname,
              slug: candidate.slug,
              title: null,
              pageType: null,
              lifecycleStatus: PageLifecycleStatus.ACTIVE,
              sourceStatus: PageSourceStatus.CRAWLED,
              existsLive: true,
              routeLastVerifiedAt: now,
            },
          });
          pageId = page.id;
          createdPageCount += 1;
          needsVersion = true;
        }

        if (needsVersion) {
          const version = await tx.pageVersion.create({
            data: {
              pageId,
              contentState: PageVersionState.LIVE_SNAPSHOT,
              contentSource: PageVersionSource.CRAWL,
              contentHash: hash,
              title: null,
              metaDescription: null,
              htmlBlobKey: null,
              markdownBlobKey: null,
              extractedJson: mergeCrawlSourceMetadata(
                {
                  url: candidate.normalizedUrl,
                  path: candidate.pathname,
                },
                {
                  source: "internal-crawl",
                  discoveredFromUrls,
                  discoveredFromPaths,
                },
              ) as Prisma.InputJsonValue,
              createdBy: "system",
            },
          });

          await tx.page.update({
            where: { id: pageId },
            data: {
              currentLivePageVersionId: version.id,
              existsLive: true,
              routeLastVerifiedAt: now,
            },
          });

          createdVersionCount += 1;
          scanTargetPageIds.add(pageId);
          scanTargetMetadata.set(pageId, { discoveredFromUrls, discoveredFromPaths });
        }
      }
    });

    // Run all scans via shared helper
    const scanBatch = await runScansForPages(
      site.workspaceId,
      [...scanTargetPageIds],
      ScanTriggerType.INITIAL_INGEST,
    );

    // Apply crawl metadata to successfully scanned pages
    const failedSet = new Set(scanBatch.failedPageIds);
    for (const pageId of scanTargetPageIds) {
      if (!failedSet.has(pageId)) {
        const metadata = scanTargetMetadata.get(pageId);
        if (metadata) {
          await applyPostScanCrawlMetadata(pageId, metadata);
        }
      }
    }

    await prisma.site.update({
      where: { id: site.id },
      data: { crawlStatus: SiteCrawlStatus.COMPLETED },
    });

    const timing = timer.stop();
    const status = deriveJobStatus(scanBatch.completedCount, scanBatch.failedCount);
    const nextStep =
      scanBatch.failedCount > 0
        ? `${scanBatch.failedCount} scan(s) failed — use /api/pages/re-audit to retry.`
        : createdPageCount > 0
          ? "New pages discovered. Run bulk recommendation generation for scanned pages."
          : "No new pages found. Internal link graph updated for existing pages.";

    return successResponse({
      siteId: site.id,
      startedAt: timing.startedAt,
      completedAt: timing.completedAt,
      durationMs: timing.durationMs,
      status,
      crawledSourcePagesCount,
      discoveredInternalLinksCount,
      createdPageCount,
      createdVersionCount,
      completedScanCount: scanBatch.completedCount,
      failedScanCount: scanBatch.failedCount,
      nextStep,
    });
  } catch (error) {
    await prisma.site.update({
      where: { id: site.id },
      data: { crawlStatus: SiteCrawlStatus.FAILED },
    });

    if (error instanceof Error) return errorResponse(error.message, 400);
    return errorResponse("Failed to crawl site.", 500);
  }
}
