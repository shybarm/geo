import { MissingPageStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const updateMissingPageOpportunitySchema = z.object({
  proposedTitle: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  proposedSlug: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  pageType: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  rationale: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  status: z.nativeEnum(MissingPageStatus).optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const json = await request.json();
    const parsed = updateMissingPageOpportunitySchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid missing page opportunity payload.", 400, parsed.error.flatten());
    }

    const existing = await prisma.missingPageOpportunity.findUnique({
      where: { id },
    });

    if (!existing) {
      return errorResponse("Missing page opportunity not found.", 404);
    }

    const data: Prisma.MissingPageOpportunityUpdateInput = {};

    if (parsed.data.proposedTitle !== undefined) data.proposedTitle = parsed.data.proposedTitle || null;
    if (parsed.data.proposedSlug !== undefined) data.proposedSlug = parsed.data.proposedSlug || null;
    if (parsed.data.pageType !== undefined) data.pageType = parsed.data.pageType || null;
    if (parsed.data.rationale !== undefined) data.rationale = parsed.data.rationale || null;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;

    const opportunity = await prisma.missingPageOpportunity.update({
      where: { id },
      data,
      include: {
        cluster: true,
        page: true,
      },
    });

    return successResponse(opportunity);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to update missing page opportunity.", 400, error.message);
    }

    return errorResponse("Failed to update missing page opportunity.", 500);
  }
}
