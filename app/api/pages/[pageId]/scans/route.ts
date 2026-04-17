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

    const scans = await prisma.scanRun.findMany({
      where: { pageId },
      include: {
        scoreSnapshots: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(scans);
  } catch {
    return errorResponse("Failed to fetch page scans.", 500);
  }
}
