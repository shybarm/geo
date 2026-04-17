import { PageLifecycleStatus, ScanRunStatus, TaskStatus } from "@prisma/client";

import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();

    const workspaceWhere = workspaceId ? { id: workspaceId } : undefined;
    const scopedWhere = workspaceId ? { workspaceId } : undefined;

    const [
      workspaceCount,
      siteCount,
      pageCount,
      livePageCount,
      draftOnlyPageCount,
      recommendationCount,
      openTaskCount,
      completedScanCount,
    ] = await Promise.all([
      prisma.workspace.count({ where: workspaceWhere }),
      prisma.site.count({ where: scopedWhere }),
      prisma.page.count({ where: scopedWhere }),
      prisma.page.count({ where: { ...(scopedWhere ?? {}), existsLive: true } }),
      prisma.page.count({
        where: {
          ...(scopedWhere ?? {}),
          lifecycleStatus: PageLifecycleStatus.DRAFT_ONLY,
        },
      }),
      prisma.recommendation.count({ where: scopedWhere }),
      prisma.task.count({
        where: {
          ...(scopedWhere ?? {}),
          status: TaskStatus.OPEN,
        },
      }),
      prisma.scanRun.count({
        where: {
          ...(scopedWhere ?? {}),
          status: ScanRunStatus.COMPLETED,
        },
      }),
    ]);

    return successResponse({
      workspaceCount,
      siteCount,
      pageCount,
      livePageCount,
      draftOnlyPageCount,
      recommendationCount,
      openTaskCount,
      completedScanCount,
    });
  } catch {
    return errorResponse("Failed to load dashboard overview.", 500);
  }
}
