import { EntitySignalType, Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const createEntitySignalSchema = z.object({
  pageVersionId: z.union([z.string().trim().min(1), z.null()]).optional(),
  entityId: z.string().trim().min(1),
  signalType: z.nativeEnum(EntitySignalType),
  visibilityScore: z.coerce.number().finite(),
  evidenceJson: z.unknown().optional(),
});

type RouteContext = {
  params: Promise<{
    pageId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;

    const signals = await prisma.pageEntitySignal.findMany({
      where: { pageId },
      include: {
        entity: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(signals);
  } catch {
    return errorResponse("Failed to fetch entity signals.", 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;
    const json = await request.json();
    const parsed = createEntitySignalSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid entity signal payload.", 400, parsed.error.flatten());
    }

    const signal = await prisma.pageEntitySignal.create({
      data: {
        pageId,
        pageVersionId: parsed.data.pageVersionId ?? null,
        entityId: parsed.data.entityId,
        signalType: parsed.data.signalType,
        visibilityScore: parsed.data.visibilityScore,
        evidenceJson:
          parsed.data.evidenceJson === undefined
            ? undefined
            : (JSON.parse(JSON.stringify(parsed.data.evidenceJson)) as Prisma.InputJsonValue),
      },
      include: {
        entity: true,
      },
    });

    return createdResponse(signal);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create entity signal.", 400, error.message);
    }

    return errorResponse("Failed to create entity signal.", 500);
  }
}
