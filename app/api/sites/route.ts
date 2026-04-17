import { Prisma, SiteCrawlStatus } from "@prisma/client";

import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createSiteSchema } from "@/lib/validators/site";

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();

    const sites = await prisma.site.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return successResponse(sites);
  } catch {
    return errorResponse("Failed to fetch sites.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createSiteSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid site payload.", 400, parsed.error.flatten());
    }

    const site = await prisma.site.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        name: parsed.data.domain,
        domain: parsed.data.domain,
        sourceType: parsed.data.sourceType,
        crawlStatus: SiteCrawlStatus.IDLE,
      },
    });

    return createdResponse(site);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create site.", 400, error.message);
    }

    return errorResponse("Failed to create site.", 500);
  }
}
