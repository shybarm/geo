import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const STALE_DAYS = 14;
const FRESH_DAYS = 7;

function msAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();

    const baseWhere = {
      currentLivePageVersionId: { not: null as null },
      ...(workspaceId ? { workspaceId } : {}),
    };

    const staleThreshold = msAgo(STALE_DAYS);
    const freshThreshold = msAgo(FRESH_DAYS);

    const include = {
      latestSuccessfulScanRun: {
        select: { completedAt: true },
      },
      latestSuccessfulScoreSnapshot: {
        select: { overallScore: true },
      },
    } as const;

    const [stalePages, recentlyScannedPages, neverScannedPages] = await Promise.all([
      prisma.page.findMany({
        where: {
          ...baseWhere,
          OR: [
            { latestSuccessfulScanRunId: null },
            { latestSuccessfulScanRun: { completedAt: { lt: staleThreshold } } },
          ],
        },
        include,
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.page.findMany({
        where: {
          ...baseWhere,
          latestSuccessfulScanRun: { completedAt: { gte: freshThreshold } },
        },
        include,
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.page.findMany({
        where: {
          ...baseWhere,
          latestSuccessfulScanRunId: null,
        },
        include,
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
    ]);

    function toItem(page: (typeof stalePages)[number]) {
      return {
        id: page.id,
        title: page.title,
        path: page.path,
        pageType: page.pageType,
        existsLive: page.existsLive,
        updatedAt: page.updatedAt.toISOString(),
        latestSuccessfulScanAt: page.latestSuccessfulScanRun?.completedAt?.toISOString() ?? null,
        latestOverallScore:
          page.latestSuccessfulScoreSnapshot?.overallScore != null
            ? Number(page.latestSuccessfulScoreSnapshot.overallScore)
            : null,
      };
    }

    return successResponse({
      stalePagesCount: stalePages.length,
      recentlyScannedPagesCount: recentlyScannedPages.length,
      neverScannedPagesCount: neverScannedPages.length,
      stalePages: stalePages.map(toItem),
      recentlyScannedPages: recentlyScannedPages.map(toItem),
      neverScannedPages: neverScannedPages.map(toItem),
    });
  } catch {
    return errorResponse("Failed to fetch freshness data.", 500);
  }
}
