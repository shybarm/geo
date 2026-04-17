import { Prisma } from "@prisma/client";

import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    pageId: string;
  }>;
};

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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;

    const snapshots = await prisma.scoreSnapshot.findMany({
      where: { pageId },
      orderBy: { createdAt: "asc" },
    });

    const history = snapshots.map((snapshot, index) => {
      const previous = index > 0 ? snapshots[index - 1] : null;
      const currentOverall = toNumber(snapshot.overallScore);
      const previousOverall = previous ? toNumber(previous.overallScore) : null;

      return {
        id: snapshot.id,
        overallScore: snapshot.overallScore,
        answerClarityScore: snapshot.answerClarityScore,
        topicalSpecificityScore: snapshot.topicalSpecificityScore,
        authorityTrustScore: snapshot.authorityTrustScore,
        expertVisibilityScore: snapshot.expertVisibilityScore,
        extractabilityScore: snapshot.extractabilityScore,
        internalLinkingScore: snapshot.internalLinkingScore,
        snippetUniquenessScore: snapshot.snippetUniquenessScore,
        conversionClarityScore: snapshot.conversionClarityScore,
        entityConsistencyScore: snapshot.entityConsistencyScore,
        updateReadinessScore: snapshot.updateReadinessScore,
        blockersCount: snapshot.blockersCount,
        confidence: snapshot.confidence,
        createdAt: snapshot.createdAt,
        delta: currentOverall !== null && previousOverall !== null ? currentOverall - previousOverall : null,
      };
    });

    return successResponse(history);
  } catch {
    return errorResponse("Failed to fetch page score history.", 500);
  }
}
