import {
  Prisma,
  RecommendationBatchStatus,
  RecommendationResolutionState,
  RecommendationStatus,
} from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildRecommendationCandidates } from "@/lib/recommendations";

const generateRecommendationsSchema = z.object({
  workspaceId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = generateRecommendationsSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid recommendation payload.", 400, parsed.error.flatten());
    }

    const page = await prisma.page.findUnique({
      where: { id: parsed.data.pageId },
      include: {
        latestSuccessfulScanRun: {
          include: {
            findings: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
        latestSuccessfulScoreSnapshot: true,
      },
    });

    if (!page || page.workspaceId !== parsed.data.workspaceId) {
      return errorResponse("Page not found.", 404);
    }

    if (!page.latestSuccessfulScanRunId || !page.latestSuccessfulScanRun) {
      return errorResponse("Page has no successful scan.", 400);
    }

    if (!page.latestSuccessfulScoreSnapshotId || !page.latestSuccessfulScoreSnapshot) {
      return errorResponse("Page has no successful score snapshot.", 400);
    }

    if (!page.currentLivePageVersionId) {
      return errorResponse("Page has no current live page version.", 400);
    }

    const recommendationsToCreate = buildRecommendationCandidates({
      pageId: page.id,
      currentLivePageVersionId: page.currentLivePageVersionId,
      score: page.latestSuccessfulScoreSnapshot,
      findings: page.latestSuccessfulScanRun.findings,
    });

    if (recommendationsToCreate.length === 0) {
      return errorResponse("No recommendations generated from the latest score state.", 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.recommendationBatch.updateMany({
        where: {
          pageId: page.id,
          status: RecommendationBatchStatus.ACTIVE,
        },
        data: {
          status: RecommendationBatchStatus.SUPERSEDED,
        },
      });

      const batch = await tx.recommendationBatch.create({
        data: {
          workspaceId: parsed.data.workspaceId,
          pageId: page.id,
          scanRunId: page.latestSuccessfulScanRunId,
          pageVersionId: page.currentLivePageVersionId,
          status: RecommendationBatchStatus.ACTIVE,
        },
      });

      const previousRecommendations = await tx.recommendation.findMany({
        where: {
          pageId: page.id,
          fingerprint: {
            in: recommendationsToCreate.map((item) => item.fingerprint),
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const createdRecommendations = [];

      for (const item of recommendationsToCreate) {
        const previous = previousRecommendations.find((entry) => entry.fingerprint === item.fingerprint);
        const recommendation = await tx.recommendation.create({
          data: {
            workspaceId: parsed.data.workspaceId,
            pageId: page.id,
            recommendationBatchId: batch.id,
            generatedFromScanRunId: page.latestSuccessfulScanRunId,
            generatedFromPageVersionId: page.currentLivePageVersionId,
            type: item.type,
            priority: item.priority,
            severity: item.severity,
            title: item.title,
            description: item.description,
            whyItMatters: item.whyItMatters,
            evidenceJson: item.evidenceJson,
            status: RecommendationStatus.OPEN,
            resolutionState: RecommendationResolutionState.UNRESOLVED,
            fingerprint: item.fingerprint,
            previousRecommendationId: previous?.id,
          },
        });
        createdRecommendations.push(recommendation);
      }

      return {
        batch,
        recommendations: createdRecommendations,
      };
    });

    return createdResponse(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to generate recommendations.", 400, error.message);
    }

    return errorResponse("Failed to generate recommendations.", 500);
  }
}
