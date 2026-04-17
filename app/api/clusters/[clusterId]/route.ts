import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    clusterId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clusterId } = await context.params;

    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: {
        memberships: {
          include: {
            page: true,
          },
          orderBy: { createdAt: "desc" },
        },
        missingPageOpportunities: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!cluster) {
      return errorResponse("Cluster not found.", 404);
    }

    return successResponse(cluster);
  } catch {
    return errorResponse("Failed to fetch cluster.", 500);
  }
}
