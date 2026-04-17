/**
 * Shared execution helpers for GEO OS heavy jobs.
 *
 * These centralise the truth-critical behaviour used by ingest, crawl,
 * re-audit, and bulk recommendation generation so individual route handlers
 * remain thin wrappers.
 */

import { type Prisma, RecommendationBatchStatus, ScanTriggerType } from "@prisma/client";

import { mergeCrawlSourceMetadata } from "./crawl-source";
import { prisma } from "./prisma";
import { reconcileRecommendationsForPage } from "./reconcile-recommendations";
import { runPageScan } from "./run-page-scan";

// ─── Scan batch runner ────────────────────────────────────────────────────────

export type ScanBatchResult = {
  completedCount: number;
  failedCount: number;
  failedPageIds: string[];
};

/**
 * Run page scans for a list of page IDs sequentially.
 * Never throws — failures are collected and returned.
 */
export async function runScansForPages(
  workspaceId: string,
  pageIds: string[],
  triggerType: ScanTriggerType,
): Promise<ScanBatchResult> {
  let completedCount = 0;
  let failedCount = 0;
  const failedPageIds: string[] = [];

  for (const pageId of pageIds) {
    try {
      const result = await runPageScan(workspaceId, pageId, triggerType);
      if (result.status === "completed") {
        completedCount += 1;
      } else {
        failedCount += 1;
        failedPageIds.push(pageId);
      }
    } catch {
      failedCount += 1;
      failedPageIds.push(pageId);
    }
  }

  return { completedCount, failedCount, failedPageIds };
}

// ─── Crawl metadata helper ────────────────────────────────────────────────────

/**
 * Merge discoveredFrom crawl metadata back into a page's live version
 * after a successful scan.  Non-critical — errors are swallowed.
 */
export async function applyPostScanCrawlMetadata(
  pageId: string,
  metadata: { discoveredFromUrls: string[]; discoveredFromPaths: string[] },
): Promise<void> {
  try {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        currentLivePageVersionId: true,
        currentLivePageVersion: { select: { extractedJson: true } },
      },
    });

    if (!page?.currentLivePageVersionId) return;

    const merged = mergeCrawlSourceMetadata(
      page.currentLivePageVersion?.extractedJson ?? null,
      {
        source: "internal-crawl",
        discoveredFromUrls: metadata.discoveredFromUrls,
        discoveredFromPaths: metadata.discoveredFromPaths,
      },
    ) as Prisma.InputJsonValue;

    await prisma.pageVersion.update({
      where: { id: page.currentLivePageVersionId },
      data: { extractedJson: merged },
    });
  } catch {
    // Non-critical — don't propagate
  }
}

// ─── Bulk recommendation generation ──────────────────────────────────────────

export type BulkRecommendationOptions = {
  siteId?: string;
  pageIds?: string[];
};

export type BulkRecommendationResult = {
  eligiblePagesCount: number;
  processedPagesCount: number;
  createdBatchesCount: number;
  createdRecommendationsCount: number;
  skippedAlreadyCoveredCount: number;
  skippedNoSuccessfulScanCount: number;
  failedPagesCount: number;
  failedPageIds: string[];
};

/**
 * Generate recommendation batches for every eligible page in the given scope.
 * Eligible = has live version + has successful scan + no active batch.
 */
export async function executeBulkRecommendations(
  workspaceId: string,
  options: BulkRecommendationOptions = {},
): Promise<BulkRecommendationResult> {
  const pages = await prisma.page.findMany({
    where: {
      workspaceId,
      ...(options.siteId ? { siteId: options.siteId } : {}),
      ...(options.pageIds && options.pageIds.length > 0
        ? { id: { in: options.pageIds } }
        : {}),
    },
    select: {
      id: true,
      currentLivePageVersionId: true,
      latestSuccessfulScanRunId: true,
      latestSuccessfulScoreSnapshotId: true,
      recommendationBatches: {
        where: { status: RecommendationBatchStatus.ACTIVE },
        select: { id: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const eligiblePages = pages.filter(
    (page) =>
      page.currentLivePageVersionId !== null &&
      page.latestSuccessfulScanRunId !== null &&
      page.latestSuccessfulScoreSnapshotId !== null &&
      page.recommendationBatches.length === 0,
  );

  const skippedAlreadyCoveredCount = pages.filter(
    (p) => p.recommendationBatches.length > 0,
  ).length;
  const skippedNoSuccessfulScanCount = pages.filter(
    (p) =>
      p.currentLivePageVersionId === null ||
      p.latestSuccessfulScanRunId === null ||
      p.latestSuccessfulScoreSnapshotId === null,
  ).length;

  let processedPagesCount = 0;
  let createdBatchesCount = 0;
  let createdRecommendationsCount = 0;
  let failedPagesCount = 0;
  const failedPageIds: string[] = [];

  for (const page of eligiblePages) {
    try {
      const result = await reconcileRecommendationsForPage(workspaceId, page.id);
      processedPagesCount += 1;
      createdBatchesCount += 1;
      createdRecommendationsCount += result.recommendations.length;
    } catch {
      failedPagesCount += 1;
      failedPageIds.push(page.id);
    }
  }

  return {
    eligiblePagesCount: eligiblePages.length,
    processedPagesCount,
    createdBatchesCount,
    createdRecommendationsCount,
    skippedAlreadyCoveredCount,
    skippedNoSuccessfulScanCount,
    failedPagesCount,
    failedPageIds,
  };
}

// ─── Re-audit page finder ─────────────────────────────────────────────────────

export type ReauditScope = "all" | "never_scanned";

export type ReauditTargetOptions = {
  workspaceId: string;
  siteId?: string;
  pageIds?: string[];
  scope?: ReauditScope;
};

/**
 * Resolve the set of page IDs to re-audit based on scope filters.
 * - "all"          : every page with a current live version
 * - "never_scanned": pages with a live version but no successful scan yet
 */
export async function resolveReauditTargets(
  options: ReauditTargetOptions,
): Promise<string[]> {
  const pages = await prisma.page.findMany({
    where: {
      workspaceId: options.workspaceId,
      currentLivePageVersionId: { not: null },
      ...(options.siteId ? { siteId: options.siteId } : {}),
      ...(options.pageIds && options.pageIds.length > 0
        ? { id: { in: options.pageIds } }
        : {}),
      ...(options.scope === "never_scanned"
        ? { latestSuccessfulScanRunId: null }
        : {}),
    } satisfies Prisma.PageWhereInput,
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  return pages.map((p) => p.id);
}
