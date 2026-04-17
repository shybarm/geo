import { RecommendationBatchStatus } from "@prisma/client";

import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ siteId: string }> };

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

function toPageItem(page: {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: Date;
  latestScanRun: { status: string; completedAt: Date | null } | null;
  latestSuccessfulScoreSnapshot: { overallScore: unknown; blockersCount: number } | null;
}) {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    pageType: page.pageType,
    existsLive: page.existsLive,
    updatedAt: page.updatedAt.toISOString(),
    latestOverallScore: toNumber(page.latestSuccessfulScoreSnapshot?.overallScore),
    latestScanStatus: page.latestScanRun?.status ?? null,
    latestScanCompletedAt: page.latestScanRun?.completedAt?.toISOString() ?? null,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { siteId } = await context.params;

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        id: true,
        domain: true,
        crawlStatus: true,
      },
    });

    if (!site) {
      return errorResponse("Site not found.", 404);
    }

    const pages = await prisma.page.findMany({
      where: { siteId },
      select: {
        id: true,
        title: true,
        path: true,
        pageType: true,
        existsLive: true,
        updatedAt: true,
        currentLivePageVersionId: true,
        latestScanRunId: true,
        latestSuccessfulScanRunId: true,
        latestSuccessfulScoreSnapshotId: true,
        latestScanRun: {
          select: {
            status: true,
            completedAt: true,
          },
        },
        latestSuccessfulScoreSnapshot: {
          select: {
            overallScore: true,
            blockersCount: true,
          },
        },
        recommendationBatches: {
          where: { status: RecommendationBatchStatus.ACTIVE },
          select: { id: true },
        },
        _count: {
          select: {
            recommendations: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const totalPages = pages.length;
    const livePagesCount = pages.filter((page) => page.existsLive).length;
    const scannedPagesCount = pages.filter((page) => page.latestScanRunId !== null).length;
    const successfulScansCount = pages.filter((page) => page.latestSuccessfulScanRunId !== null).length;

    const failedScanPages = pages
      .filter((page) => (page.latestScanRun?.status === "FAILED") || (page.latestScanRunId !== null && page.latestSuccessfulScanRunId === null))
      .map(toPageItem);

    const failedScansCount = failedScanPages.length;

    const neverScannedPages = pages
      .filter((page) => page.currentLivePageVersionId !== null && page.latestSuccessfulScanRunId === null)
      .map(toPageItem);

    const neverScannedPagesCount = neverScannedPages.length;

    const pagesWithRecommendationsCount = pages.filter((page) => page._count.recommendations > 0).length;

    const pagesWithBlockers = pages
      .filter((page) => (page.latestSuccessfulScoreSnapshot?.blockersCount ?? 0) > 0)
      .map(toPageItem);

    const pagesWithBlockersCount = pagesWithBlockers.length;

    const pagesNeedingRecommendations = pages
      .filter((page) => page.latestSuccessfulScanRunId !== null && page.recommendationBatches.length === 0)
      .map(toPageItem);
    const pagesNeedingRecommendationsCount = pagesNeedingRecommendations.length;

    let setupState = "Ready for optimization";

    if (totalPages === 0) {
      setupState = "Not started";
    } else if (
      site.crawlStatus === "FAILED" ||
      failedScansCount > 0 ||
      neverScannedPagesCount > 0 ||
      pagesWithBlockersCount > 0
    ) {
      setupState = "Needs review";
    } else if (
      site.crawlStatus === "RUNNING" ||
      site.crawlStatus === "QUEUED" ||
      pagesNeedingRecommendationsCount > 0 ||
      successfulScansCount < livePagesCount
    ) {
      setupState = "Partially ready";
    }

    return successResponse({
      siteId: site.id,
      domain: site.domain,
      crawlStatus: site.crawlStatus,
      totalPages,
      livePagesCount,
      scannedPagesCount,
      successfulScansCount,
      failedScansCount,
      neverScannedPagesCount,
      pagesWithRecommendationsCount,
      pagesWithBlockersCount,
      pagesNeedingRecommendationsCount,
      setupState,
      failedScanPages,
      neverScannedPages,
      pagesWithBlockers,
      pagesNeedingRecommendations,
    });
  } catch {
    return errorResponse("Failed to fetch site setup status.", 500);
  }
}
