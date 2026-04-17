import { Prisma } from "@prisma/client";

import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function toNumber(value: Prisma.Decimal | string | number | null) {
  if (value === null) {
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

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const scopedWhere = workspaceId ? { workspaceId } : undefined;

    const [snapshots, pages, scanRuns] = await Promise.all([
      prisma.scoreSnapshot.findMany({
        where: scopedWhere,
        include: {
          page: true,
        },
        orderBy: [{ pageId: "asc" }, { createdAt: "asc" }],
      }),
      prisma.page.findMany({
        where: scopedWhere,
      }),
      prisma.scanRun.findMany({
        where: scopedWhere,
        distinct: ["pageId"],
        select: {
          pageId: true,
        },
      }),
    ]);

    const grouped = new Map();

    for (const snapshot of snapshots) {
      const key = snapshot.pageId;
      if (!key) {
        continue;
      }

      const list = grouped.get(key) ?? [];
      list.push(snapshot);
      grouped.set(key, list);
    }

    let improvedPagesCount = 0;
    let declinedPagesCount = 0;
    let unchangedPagesCount = 0;

    const topImprovedPages = [];
    const latestSnapshots = [];

    for (const page of pages) {
      const pageSnapshots = grouped.get(page.id) ?? [];

      if (pageSnapshots.length > 0) {
        const latest = pageSnapshots[pageSnapshots.length - 1];
        latestSnapshots.push({
          pageId: page.id,
          pageTitle: page.title,
          overallScore: latest.overallScore,
          blockersCount: latest.blockersCount,
          createdAt: latest.createdAt,
        });
      }

      if (pageSnapshots.length < 2) {
        continue;
      }

      const previous = pageSnapshots[pageSnapshots.length - 2];
      const latest = pageSnapshots[pageSnapshots.length - 1];
      const previousScore = toNumber(previous.overallScore);
      const latestScore = toNumber(latest.overallScore);

      if (previousScore === null || latestScore === null) {
        continue;
      }

      const delta = latestScore - previousScore;

      if (delta > 0) {
        improvedPagesCount += 1;
      } else if (delta < 0) {
        declinedPagesCount += 1;
      } else {
        unchangedPagesCount += 1;
      }

      topImprovedPages.push({
        pageId: page.id,
        pageTitle: page.title,
        beforeScore: previous.overallScore,
        afterScore: latest.overallScore,
        delta,
        createdAt: latest.createdAt,
      });
    }

    const averageOverallScore = snapshots.length === 0
      ? null
      : snapshots.reduce((sum, snapshot) => sum + (toNumber(snapshot.overallScore) ?? 0), 0) / snapshots.length;

    topImprovedPages.sort((a, b) => b.delta - a.delta);
    latestSnapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return successResponse({
      totalSnapshots: snapshots.length,
      averageOverallScore,
      improvedPagesCount,
      declinedPagesCount,
      unchangedPagesCount,
      recentlyScannedPagesCount: scanRuns.filter((scanRun) => scanRun.pageId).length,
      latestSnapshots: latestSnapshots.slice(0, 5),
      topImprovedPages: topImprovedPages.filter((item) => item.delta > 0).slice(0, 5),
    });
  } catch {
    return errorResponse("Failed to fetch dashboard trends.", 500);
  }
}
