import { MissingPageStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const createMissingPageOpportunitySchema = z.object({
  workspaceId: z.string().trim().min(1),
  clusterId: z.union([z.string().trim().min(1), z.null()]).optional(),
  pageId: z.union([z.string().trim().min(1), z.null()]).optional(),
  proposedTitle: z.string().trim().min(1).max(300),
  proposedSlug: z.string().trim().min(1).max(200),
  pageType: z.string().trim().min(1).max(200),
  rationale: z.string().trim().min(1).max(1000),
});

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const clusterId = searchParams.get("clusterId")?.trim();
    const status = searchParams.get("status")?.trim() as MissingPageStatus | null;

    const opportunities = await prisma.missingPageOpportunity.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(clusterId ? { clusterId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        cluster: true,
        page: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(opportunities);
  } catch {
    return errorResponse("Failed to fetch missing page opportunities.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createMissingPageOpportunitySchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid missing page opportunity payload.", 400, parsed.error.flatten());
    }

    const opportunity = await prisma.missingPageOpportunity.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        clusterId: parsed.data.clusterId ?? null,
        pageId: parsed.data.pageId ?? null,
        proposedTitle: parsed.data.proposedTitle,
        proposedSlug: parsed.data.proposedSlug,
        pageType: parsed.data.pageType,
        rationale: parsed.data.rationale,
        status: MissingPageStatus.OPEN,
      },
    });

    return createdResponse(opportunity);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create missing page opportunity.", 400, error.message);
    }

    return errorResponse("Failed to create missing page opportunity.", 500);
  }
}
