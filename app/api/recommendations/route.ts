import { RecommendationStatus } from "@prisma/client";

import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const pageId = searchParams.get("pageId")?.trim();
    const status = searchParams.get("status")?.trim() as RecommendationStatus | null;

    const where = {
      ...(workspaceId ? { workspaceId } : {}),
      ...(pageId ? { pageId } : {}),
      ...(status ? { status } : {}),
    };

    const recommendations = await prisma.recommendation.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        page: true,
        recommendationBatch: true,
        linkedTasks: {
          select: {
            id: true,
            status: true,
            priority: true,
            dueDate: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(recommendations);
  } catch {
    return errorResponse("Failed to fetch recommendations.", 500);
  }
}
