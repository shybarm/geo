import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type DuplicatePageItem = {
  id: string;
  title: string | null;
  url: string;
  canonicalUrl: string | null;
  path: string;
  slug: string;
  pageType: string | null;
  lifecycleStatus: string;
  existsLive: boolean;
  currentLivePageVersionId: string | null;
  latestSuccessfulScanRunId: string | null;
  latestOverallScore: number | null;
  updatedAt: string;
};

type DuplicateGroup = {
  groupKey: string;
  siteId: string;
  pageCount: number;
  suggestedPrimaryPageId: string;
  pages: DuplicatePageItem[];
};

// Normalize a canonical URL or path string for comparison
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\/+$/, "").trim() || "/";
}

// Pick the best primary page from a duplicate group
function pickPrimary(pages: DuplicatePageItem[]): string {
  // Prefer: has live version > has scan > most recently updated
  const withLive = pages.filter((p) => p.currentLivePageVersionId !== null);
  const pool = withLive.length > 0 ? withLive : pages;

  const withScan = pool.filter((p) => p.latestSuccessfulScanRunId !== null);
  const pool2 = withScan.length > 0 ? withScan : pool;

  // Sort by updatedAt desc, pick first
  const sorted = [...pool2].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return sorted[0].id;
}

export async function GET(request: Request) {
  try {
    const params = parseSearchParams(request.url);
    const workspaceId = params.get("workspaceId") ?? undefined;
    const siteId = params.get("siteId") ?? undefined;

    const where = {
      // Only consider non-archived pages as duplicate candidates
      lifecycleStatus: { notIn: ["ARCHIVED"] as never[] },
      ...(workspaceId ? { workspaceId } : {}),
      ...(siteId ? { siteId } : {}),
    };

    const pages = await prisma.page.findMany({
      where,
      select: {
        id: true,
        siteId: true,
        title: true,
        url: true,
        canonicalUrl: true,
        path: true,
        slug: true,
        pageType: true,
        lifecycleStatus: true,
        existsLive: true,
        currentLivePageVersionId: true,
        latestSuccessfulScanRunId: true,
        latestSuccessfulScoreSnapshot: { select: { overallScore: true } },
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Build duplicate groups keyed by (siteId + normalizedKey)
    // Strategy 1: same normalised canonicalUrl within the same site
    // Strategy 2: same normalised path within the same site (catches trailing-slash variants etc.)
    // We use two passes and deduplicate overlapping groups.

    // Map from groupKey -> set of page ids
    const groupMap = new Map<string, Set<string>>();
    const pageById = new Map<string, (typeof pages)[number]>();

    for (const page of pages) {
      pageById.set(page.id, page);
    }

    // Pass 1: group by (siteId, normalizedCanonicalUrl) — only when canonicalUrl is non-empty
    const byCanonical = new Map<string, string[]>();
    for (const page of pages) {
      if (!page.canonicalUrl) continue;
      const key = `${page.siteId}::canonical::${normalizeKey(page.canonicalUrl)}`;
      const group = byCanonical.get(key) ?? [];
      group.push(page.id);
      byCanonical.set(key, group);
    }
    for (const [key, ids] of byCanonical.entries()) {
      if (ids.length > 1) {
        const existing = groupMap.get(key) ?? new Set<string>();
        for (const id of ids) existing.add(id);
        groupMap.set(key, existing);
      }
    }

    // Pass 2: group by (siteId, normalizedPath) — catches /foo vs /foo/ etc.
    const byPath = new Map<string, string[]>();
    for (const page of pages) {
      const key = `${page.siteId}::path::${normalizeKey(page.path)}`;
      const group = byPath.get(key) ?? [];
      group.push(page.id);
      byPath.set(key, group);
    }
    for (const [key, ids] of byPath.entries()) {
      if (ids.length > 1) {
        const existing = groupMap.get(key) ?? new Set<string>();
        for (const id of ids) existing.add(id);
        groupMap.set(key, existing);
      }
    }

    // Deduplicate: if the same page appears in two groups, merge those groups
    // Build a union-find style merge based on shared page IDs
    const finalGroups = new Map<string, Set<string>>();
    for (const [key, ids] of groupMap.entries()) {
      finalGroups.set(key, new Set(ids));
    }

    // Merge groups that share pages (greedy single pass is sufficient for typical duplicates)
    const mergedKeys = new Set<string>();
    const keys = Array.from(finalGroups.keys());
    for (let i = 0; i < keys.length; i++) {
      if (mergedKeys.has(keys[i])) continue;
      for (let j = i + 1; j < keys.length; j++) {
        if (mergedKeys.has(keys[j])) continue;
        const a = finalGroups.get(keys[i])!;
        const b = finalGroups.get(keys[j])!;
        const hasOverlap = [...a].some((id) => b.has(id));
        if (hasOverlap) {
          for (const id of b) a.add(id);
          mergedKeys.add(keys[j]);
        }
      }
    }

    const groups: DuplicateGroup[] = [];
    let totalDuplicatePages = 0;

    for (const [key, pageIdSet] of finalGroups.entries()) {
      if (mergedKeys.has(key)) continue;
      if (pageIdSet.size < 2) continue;

      const groupPages: DuplicatePageItem[] = [];
      let groupSiteId = "";

      for (const id of pageIdSet) {
        const p = pageById.get(id);
        if (!p) continue;
        groupSiteId = p.siteId;
        groupPages.push({
          id: p.id,
          title: p.title,
          url: p.url,
          canonicalUrl: p.canonicalUrl,
          path: p.path,
          slug: p.slug,
          pageType: p.pageType,
          lifecycleStatus: p.lifecycleStatus as string,
          existsLive: p.existsLive,
          currentLivePageVersionId: p.currentLivePageVersionId,
          latestSuccessfulScanRunId: p.latestSuccessfulScanRunId,
          latestOverallScore: p.latestSuccessfulScoreSnapshot?.overallScore
            ? Number(p.latestSuccessfulScoreSnapshot.overallScore)
            : null,
          updatedAt: p.updatedAt.toISOString(),
        });
      }

      if (groupPages.length < 2) continue;

      const suggestedPrimaryPageId = pickPrimary(groupPages);
      totalDuplicatePages += groupPages.length;

      groups.push({
        groupKey: key,
        siteId: groupSiteId,
        pageCount: groupPages.length,
        suggestedPrimaryPageId,
        pages: groupPages.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
      });
    }

    // Sort groups: most pages first
    groups.sort((a, b) => b.pageCount - a.pageCount);

    return successResponse({
      duplicateGroupsCount: groups.length,
      duplicatePagesCount: totalDuplicatePages,
      groups,
    });
  } catch {
    return errorResponse("Failed to detect duplicates.", 500);
  }
}
