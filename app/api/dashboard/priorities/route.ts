import { Prisma, RecommendationBatchStatus } from "@prisma/client";

import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type PriorityItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: string;
  latestOverallScore: number | null;
  blockersCount: number;
};

type ImprovedItem = PriorityItem & {
  delta: number;
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return value;
}

function mapPriorityItem(page: {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: Date;
  latestSuccessfulScoreSnapshot?: {
    overallScore: Prisma.Decimal | number | string | null;
    blockersCount: number;
  } | null;
}): PriorityItem {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    pageType: page.pageType,
    existsLive: page.existsLive,
    updatedAt: page.updatedAt.toISOString(),
    latestOverallScore: toNumber(page.latestSuccessfulScoreSnapshot?.overallScore),
    blockersCount: page.latestSuccessfulScoreSnapshot?.blockersCount ?? 0,
  };
}

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const pageWhere = workspaceId ? { workspaceId } : undefined;
    const snapshotWhere = workspaceId ? { workspaceId } : undefined;
    const batchWhere = workspaceId ? { workspaceId, status: RecommendationBatchStatus.ACTIVE } : { status: RecommendationBatchStatus.ACTIVE };

    const [weakPagesRaw, unscannedPagesRaw, pagesWithBlockersRaw, pagesNeedingRecommendationsRaw, snapshots] = await Promise.all([
      prisma.page.findMany({
        where: {
          ...(pageWhere ?? {}),
          latestSuccessfulScoreSnapshot: {
            is: {
              overallScore: { lt: 50 },
            },
          },
        },
        include: {
          latestSuccessfulScoreSnapshot: {
            select: {
              overallScore: true,
              blockersCount: true,
            },
          },
        },
        orderBy: {
          latestSuccessfulScoreSnapshot: {
            overallScore: "asc",
          },
        },
        take: 8,
      }),
      prisma.page.findMany({
        where: {
          ...(pageWhere ?? {}),
          currentLivePageVersionId: { not: null },
          latestSuccessfulScanRunId: null,
        },
        include: {
          latestSuccessfulScoreSnapshot: {
            select: {
              overallScore: true,
              blockersCount: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.page.findMany({
        where: {
          ...(pageWhere ?? {}),
          latestSuccessfulScoreSnapshot: {
            is: {
              blockersCount: { gt: 0 },
            },
          },
        },
        include: {
          latestSuccessfulScoreSnapshot: {
            select: {
              overallScore: true,
              blockersCount: true,
            },
          },
        },
        orderBy: {
          latestSuccessfulScoreSnapshot: {
            blockersCount: "desc",
          },
        },
        take: 8,
      }),
      prisma.page.findMany({
        where: {
          ...(pageWhere ?? {}),
          latestSuccessfulScanRunId: { not: null },
          recommendationBatches: {
            none: {
              status: RecommendationBatchStatus.ACTIVE,
            },
          },
        },
        include: {
          latestSuccessfulScoreSnapshot: {
            select: {
              overallScore: true,
              blockersCount: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.scoreSnapshot.findMany({
        where: snapshotWhere,
        select: {
          id: true,
          pageId: true,
          overallScore: true,
          blockersCount: true,
          createdAt: true,
          page: {
            select: {
              id: true,
              title: true,
              path: true,
              pageType: true,
              existsLive: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const improvedCandidates = new Map<string, ImprovedItem>();

    for (const snapshot of snapshots) {
      if (!snapshot.pageId || !snapshot.page) {
        continue;
      }

      const existing = improvedCandidates.get(snapshot.pageId);
      const score = toNumber(snapshot.overallScore);

      if (!existing) {
        improvedCandidates.set(snapshot.pageId, {
          id: snapshot.page.id,
          title: snapshot.page.title,
          path: snapshot.page.path,
          pageType: snapshot.page.pageType,
          existsLive: snapshot.page.existsLive,
          updatedAt: snapshot.page.updatedAt.toISOString(),
          latestOverallScore: score,
          blockersCount: snapshot.blockersCount,
          delta: Number.NEGATIVE_INFINITY,
        });
        continue;
      }

      if (existing.delta !== Number.NEGATIVE_INFINITY) {
        continue;
      }

      const previousScore = score;
      const latestScore = existing.latestOverallScore;

      if (latestScore !== null && previousScore !== null && latestScore > previousScore) {
        existing.delta = latestScore - previousScore;
      } else {
        existing.delta = Number.NaN;
      }
    }

    const recentlyImprovedPages = Array.from(improvedCandidates.values())
      .filter((item) => Number.isFinite(item.delta) && item.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 8);

    return successResponse({
      weakPages: weakPagesRaw.map(mapPriorityItem),
      unscannedPages: unscannedPagesRaw.map(mapPriorityItem),
      pagesWithBlockers: pagesWithBlockersRaw.map(mapPriorityItem),
      pagesNeedingRecommendations: pagesNeedingRecommendationsRaw.map(mapPriorityItem),
      recentlyImprovedPages,
    });
  } catch {
    return errorResponse("Failed to fetch dashboard priorities.", 500);
  }
}
