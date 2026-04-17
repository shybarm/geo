import { EntityType, Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const createEntitySchema = z.object({
  workspaceId: z.string().trim().min(1),
  entityType: z.nativeEnum(EntityType),
  name: z.string().trim().min(1).max(200),
  canonicalName: z.string().trim().min(1).max(200),
  metadataJson: z.unknown().optional(),
});

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const entityType = searchParams.get("entityType")?.trim() as EntityType | null;

    const entities = await prisma.entity.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(entityType ? { entityType } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(entities);
  } catch {
    return errorResponse("Failed to fetch entities.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createEntitySchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid entity payload.", 400, parsed.error.flatten());
    }

    const entity = await prisma.entity.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        entityType: parsed.data.entityType,
        name: parsed.data.name,
        canonicalName: parsed.data.canonicalName,
        metadataJson:
          parsed.data.metadataJson === undefined
            ? undefined
            : (JSON.parse(JSON.stringify(parsed.data.metadataJson)) as Prisma.InputJsonValue),
      },
    });

    return createdResponse(entity);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create entity.", 400, error.message);
    }

    return errorResponse("Failed to create entity.", 500);
  }
}
