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
      select: { id: true, latestSuccessfulScanRunId: true },
    });

    if (!page) {
      return errorResponse("Page not found.", 404);
    }

    if (!page.latestSuccessfulScanRunId) {
      return successResponse([]);
    }

    const findings = await prisma.scanFinding.findMany({
      where: { scanRunId: page.latestSuccessfulScanRunId },
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
    });

    return successResponse(findings);
  } catch {
    return errorResponse("Failed to fetch findings.", 500);
  }
}
