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

    const versions = await prisma.pageVersion.findMany({
      where: { pageId },
      select: {
        id: true,
        contentState: true,
        contentSource: true,
        contentHash: true,
        title: true,
        metaDescription: true,
        extractedJson: true,
        createdBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(versions);
  } catch {
    return errorResponse("Failed to fetch page versions.", 500);
  }
}
