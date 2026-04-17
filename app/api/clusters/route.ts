import { Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const createClusterSchema = z.object({
  workspaceId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(200),
  ownerUserId: z.union([z.string().trim().min(1), z.null()]).optional(),
});

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();

    const clusters = await prisma.cluster.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: {
        _count: {
          select: {
            memberships: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(clusters);
  } catch {
    return errorResponse("Failed to fetch clusters.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createClusterSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid cluster payload.", 400, parsed.error.flatten());
    }

    const cluster = await prisma.cluster.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        name: parsed.data.name,
        topic: parsed.data.topic,
        ownerUserId: parsed.data.ownerUserId ?? null,
      },
    });

    return createdResponse(cluster);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create cluster.", 400, error.message);
    }

    return errorResponse("Failed to create cluster.", 500);
  }
}
