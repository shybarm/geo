import { Prisma, ScanRunStatus } from "@prisma/client";

import { runPageScan } from "@/lib/run-page-scan";
import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createScanSchema } from "@/lib/validators/scan";

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const siteId = searchParams.get("siteId")?.trim();
    const pageId = searchParams.get("pageId")?.trim();
    const status = searchParams.get("status")?.trim();

    const where: Prisma.ScanRunWhereInput = {
      ...(workspaceId ? { workspaceId } : {}),
      ...(siteId ? { page: { siteId } } : {}),
      ...(pageId ? { pageId } : {}),
      ...(status ? { status: status as ScanRunStatus } : {}),
    };

    const scans = await prisma.scanRun.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        page: {
          select: {
            id: true,
            title: true,
            path: true,
            siteId: true,
          },
        },
        scoreSnapshots: {
          select: {
            id: true,
            overallScore: true,
            blockersCount: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(
      scans.map((scan) => ({
        id: scan.id,
        pageId: scan.pageId,
        page: scan.page,
        triggerType: scan.triggerType,
        status: scan.status,
        failureCode: scan.failureCode,
        errorMessage: scan.errorMessage,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
        createdAt: scan.createdAt,
        scoreSnapshot: scan.scoreSnapshots[0] ?? null,
      })),
    );
  } catch {
    return errorResponse("Failed to fetch scans.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createScanSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid scan payload.", 400, parsed.error.flatten());
    }

    const page = await prisma.page.findUnique({
      where: { id: parsed.data.pageId },
    });

    if (!page || page.workspaceId !== parsed.data.workspaceId) {
      return errorResponse("Page not found.", 404);
    }

    if (!page.currentLivePageVersionId) {
      return errorResponse("Page has no current live page version.", 400);
    }

    const result = await runPageScan(parsed.data.workspaceId, parsed.data.pageId);

    if (result.status === "failed") {
      return errorResponse(`Scan failed: ${result.errorMessage}`, 502, {
        scanRunId: result.scanRunId,
        failureCode: result.failureCode,
      });
    }

    return createdResponse({ scanRunId: result.scanRunId, status: result.status });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create scan.", 400, error.message);
    }

    return errorResponse("Failed to create scan.", 500);
  }
}
