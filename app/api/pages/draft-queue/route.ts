import { RecommendationBatchStatus } from "@prisma/client";

import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type DraftQueueItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  lifecycleStatus: string;
  existsLive: boolean;
  updatedAt: string;
  currentLivePageVersionId: string | null;
  latestDraftVersionId: string | null;
  latestSuccessfulScanAt: string | null;
  latestOverallScore: number | null;
  activeRecommendationCount: number;
  readinessState: string;
};

const VALID_STATES = [
  "Draft only",
  "Ready to apply",
  "Ready to verify",
  "Ready to scan",
  "Ready to reconcile",
  "Active live",
] as const;

type ReadinessState = (typeof VALID_STATES)[number];

function computeReadiness(flags: {
  isDraftOnly: boolean;
  isReadyToApply: boolean;
  needsVerify: boolean;
  needsScan: boolean;
  needsReconcile: boolean;
}): ReadinessState {
  if (flags.isReadyToApply) return "Ready to apply";
  if (flags.isDraftOnly) return "Draft only";
  if (flags.needsVerify) return "Ready to verify";
  if (flags.needsScan) return "Ready to scan";
  if (flags.needsReconcile) return "Ready to reconcile";
  return "Active live";
}

export async function GET(request: Request) {
  try {
    const params = parseSearchParams(request.url);
    const workspaceId = params.get("workspaceId") ?? undefined;
    const siteId = params.get("siteId") ?? undefined;
    const stateFilter = params.get("state") ?? undefined;

    const where = {
      ...(workspaceId ? { workspaceId } : {}),
      ...(siteId ? { siteId } : {}),
    };

    // 1. Fetch pages with needed fields
    const pages = await prisma.page.findMany({
      where,
      select: {
        id: true,
        title: true,
        path: true,
        pageType: true,
        lifecycleStatus: true,
        existsLive: true,
        updatedAt: true,
        currentLivePageVersionId: true,
        latestSuccessfulScanRunId: true,
        currentLivePageVersion: {
          select: { contentHash: true },
        },
        latestSuccessfulScanRun: {
          select: { completedAt: true },
        },
        latestSuccessfulScoreSnapshot: {
          select: { overallScore: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (pages.length === 0) {
      return successResponse({
        totalDraftPages: 0,
        draftOnlyPagesCount: 0,
        pagesWithDraftReadyToApplyCount: 0,
        pagesNeedingVerifyCount: 0,
        pagesNeedingScanCount: 0,
        pagesNeedingReconcileCount: 0,
        draftOnlyPages: [],
        draftReadyToApply: [],
        pagesNeedingVerify: [],
        pagesNeedingScan: [],
        pagesNeedingReconcile: [],
      });
    }

    const pageIds = pages.map((p) => p.id);

    // 2. Latest DRAFT version per page
    const draftVersionsRaw = await prisma.pageVersion.findMany({
      where: { pageId: { in: pageIds }, contentState: "DRAFT" },
      select: { id: true, pageId: true, contentHash: true },
      orderBy: { createdAt: "desc" },
    });

    const latestDraftByPage = new Map<
      string,
      { id: string; contentHash: string | null }
    >();
    for (const v of draftVersionsRaw) {
      if (!latestDraftByPage.has(v.pageId)) {
        latestDraftByPage.set(v.pageId, { id: v.id, contentHash: v.contentHash });
      }
    }

    // 3. Active recommendation batches per page
    const activeBatches = await prisma.recommendationBatch.findMany({
      where: {
        pageId: { in: pageIds },
        status: RecommendationBatchStatus.ACTIVE,
      },
      select: { pageId: true, scanRunId: true },
    });

    const activeBatchByPage = new Map<string, { scanRunId: string | null }>();
    for (const batch of activeBatches) {
      if (batch.pageId && !activeBatchByPage.has(batch.pageId)) {
        activeBatchByPage.set(batch.pageId, { scanRunId: batch.scanRunId });
      }
    }

    // 4. Open recommendation counts per page
    const openRecCounts = await prisma.recommendation.groupBy({
      by: ["pageId"],
      where: { pageId: { in: pageIds }, status: "OPEN" },
      _count: { id: true },
    });

    const openRecCountByPage = new Map<string, number>();
    for (const row of openRecCounts) {
      if (row.pageId) openRecCountByPage.set(row.pageId, row._count.id);
    }

    // 5. Classify each page into buckets
    const draftOnlyPages: DraftQueueItem[] = [];
    const draftReadyToApply: DraftQueueItem[] = [];
    const pagesNeedingVerify: DraftQueueItem[] = [];
    const pagesNeedingScan: DraftQueueItem[] = [];
    const pagesNeedingReconcile: DraftQueueItem[] = [];

    for (const page of pages) {
      const latestDraft = latestDraftByPage.get(page.id);
      const activeBatch = activeBatchByPage.get(page.id);
      const openRecCount = openRecCountByPage.get(page.id) ?? 0;

      const draftDiffersFromLive = latestDraft
        ? !page.currentLivePageVersionId ||
          latestDraft.contentHash !== page.currentLivePageVersion?.contentHash
        : false;

      const isDraftOnly =
        page.lifecycleStatus === "DRAFT_ONLY" && !page.currentLivePageVersionId;
      const isReadyToApply = !!latestDraft && draftDiffersFromLive;
      const needsVerify =
        page.currentLivePageVersionId !== null && !page.existsLive;
      const needsScan =
        page.currentLivePageVersionId !== null &&
        page.existsLive &&
        !page.latestSuccessfulScanRunId;
      const needsReconcile =
        !!page.latestSuccessfulScanRunId &&
        (!activeBatch ||
          activeBatch.scanRunId !== page.latestSuccessfulScanRunId);

      const readinessState = computeReadiness({
        isDraftOnly,
        isReadyToApply,
        needsVerify,
        needsScan,
        needsReconcile,
      });

      const item: DraftQueueItem = {
        id: page.id,
        title: page.title,
        path: page.path,
        pageType: page.pageType,
        lifecycleStatus: page.lifecycleStatus as string,
        existsLive: page.existsLive,
        updatedAt: page.updatedAt.toISOString(),
        currentLivePageVersionId: page.currentLivePageVersionId,
        latestDraftVersionId: latestDraft?.id ?? null,
        latestSuccessfulScanAt:
          page.latestSuccessfulScanRun?.completedAt?.toISOString() ?? null,
        latestOverallScore: page.latestSuccessfulScoreSnapshot?.overallScore
          ? Number(page.latestSuccessfulScoreSnapshot.overallScore)
          : null,
        activeRecommendationCount: openRecCount,
        readinessState,
      };

      if (isDraftOnly) draftOnlyPages.push(item);
      if (isReadyToApply) draftReadyToApply.push(item);
      if (needsVerify) pagesNeedingVerify.push(item);
      if (needsScan) pagesNeedingScan.push(item);
      if (needsReconcile) pagesNeedingReconcile.push(item);
    }

    // 6. Apply optional state filter
    const filterByState = (items: DraftQueueItem[]) => {
      if (!stateFilter) return items;
      return items.filter((i) => i.readinessState === stateFilter);
    };

    const filteredDraftOnly = filterByState(draftOnlyPages);
    const filteredReadyToApply = filterByState(draftReadyToApply);
    const filteredNeedingVerify = filterByState(pagesNeedingVerify);
    const filteredNeedingScan = filterByState(pagesNeedingScan);
    const filteredNeedingReconcile = filterByState(pagesNeedingReconcile);

    const allQueuedIds = new Set<string>([
      ...draftOnlyPages.map((p) => p.id),
      ...draftReadyToApply.map((p) => p.id),
      ...pagesNeedingVerify.map((p) => p.id),
      ...pagesNeedingScan.map((p) => p.id),
      ...pagesNeedingReconcile.map((p) => p.id),
    ]);

    return successResponse({
      totalDraftPages: allQueuedIds.size,
      draftOnlyPagesCount: draftOnlyPages.length,
      pagesWithDraftReadyToApplyCount: draftReadyToApply.length,
      pagesNeedingVerifyCount: pagesNeedingVerify.length,
      pagesNeedingScanCount: pagesNeedingScan.length,
      pagesNeedingReconcileCount: pagesNeedingReconcile.length,
      draftOnlyPages: filteredDraftOnly,
      draftReadyToApply: filteredReadyToApply,
      pagesNeedingVerify: filteredNeedingVerify,
      pagesNeedingScan: filteredNeedingScan,
      pagesNeedingReconcile: filteredNeedingReconcile,
    });
  } catch {
    return errorResponse("Failed to fetch draft queue.", 500);
  }
}
