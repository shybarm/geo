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

    const recommendations = await prisma.recommendation.findMany({
      where: { pageId },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(recommendations);
  } catch {
    return errorResponse("Failed to fetch recommendations.", 500);
  }
}
