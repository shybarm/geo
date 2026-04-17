import { ClusterMembershipRole, ClusterMembershipSource, Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const createMembershipSchema = z.object({
  pageId: z.string().trim().min(1),
  role: z.nativeEnum(ClusterMembershipRole),
  source: z.nativeEnum(ClusterMembershipSource).optional(),
});

type RouteContext = {
  params: Promise<{
    clusterId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { clusterId } = await context.params;
    const json = await request.json();
    const parsed = createMembershipSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid cluster membership payload.", 400, parsed.error.flatten());
    }

    const cluster = await prisma.cluster.findUnique({ where: { id: clusterId } });

    if (!cluster) {
      return errorResponse("Cluster not found.", 404);
    }

    const existingMembership = await prisma.clusterMembership.findUnique({
      where: {
        clusterId_pageId: {
          clusterId,
          pageId: parsed.data.pageId,
        },
      },
    });

    if (existingMembership) {
      return errorResponse("Page is already in this cluster.", 409);
    }

    const membership = await prisma.clusterMembership.create({
      data: {
        clusterId,
        pageId: parsed.data.pageId,
        role: parsed.data.role,
        source: parsed.data.source ?? ClusterMembershipSource.MANUAL,
      },
      include: {
        page: true,
      },
    });

    return createdResponse(membership);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create cluster membership.", 400, error.message);
    }

    return errorResponse("Failed to create cluster membership.", 500);
  }
}
