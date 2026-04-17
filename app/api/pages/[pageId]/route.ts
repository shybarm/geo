import { PageVersionState, RecommendationBatchStatus } from "@prisma/client";

import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    pageId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        currentLivePageVersion: true,
        versions: {
          where: {
            contentState: PageVersionState.DRAFT,
          },
          orderBy: { createdAt: "desc" },
        },
        latestScanRun: true,
        latestSuccessfulScanRun: {
          select: {
            id: true,
            status: true,
            triggerType: true,
            completedAt: true,
            findings: {
              select: {
                id: true,
                findingType: true,
                code: true,
                title: true,
                severity: true,
                explanation: true,
                evidenceJson: true,
                createdAt: true,
              },
              orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
            },
          },
        },
        latestScoreSnapshot: true,
        latestSuccessfulScoreSnapshot: true,
        recommendationBatches: {
          where: {
            status: RecommendationBatchStatus.ACTIVE,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!page) {
      return errorResponse("Page not found.", 404);
    }

    return successResponse(page);
  } catch {
    return errorResponse("Failed to fetch page.", 500);
  }
}
