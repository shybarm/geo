import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { runPageScan } from "@/lib/run-page-scan";

type RouteContext = {
  params: Promise<{ scanId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { scanId } = await context.params;

    const scan = await prisma.scanRun.findUnique({
      where: { id: scanId },
      select: {
        id: true,
        workspaceId: true,
        pageId: true,
      },
    });

    if (!scan) {
      return errorResponse("Scan not found.", 404);
    }

    if (!scan.pageId) {
      return errorResponse("Scan has no linked page.", 400);
    }

    const result = await runPageScan(scan.workspaceId, scan.pageId);

    return successResponse({
      oldScanId: scan.id,
      newScanId: result.scanRunId,
      newStatus: result.status === "completed" ? "COMPLETED" : "FAILED",
    });
  } catch (error) {
    if (error instanceof Error) {
      return errorResponse(error.message, 400);
    }

    return errorResponse("Failed to retry scan.", 500);
  }
}
