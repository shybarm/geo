import { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const createTaskSchema = z.object({
  workspaceId: z.string().trim().min(1),
  linkedPageId: z.union([z.string().trim().min(1), z.null()]).optional(),
  linkedRecommendationId: z.union([z.string().trim().min(1), z.null()]).optional(),
  title: z.string().trim().min(1).max(300),
  description: z.union([z.string().trim().min(1), z.null()]).optional(),
  priority: z.nativeEnum(TaskPriority),
  ownerUserId: z.union([z.string().trim().min(1), z.null()]).optional(),
  dueDate: z.union([z.string().datetime(), z.null()]).optional(),
});

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const linkedPageId = searchParams.get("linkedPageId")?.trim();
    const linkedRecommendationId = searchParams.get("linkedRecommendationId")?.trim();

    const where = {
      ...(workspaceId ? { workspaceId } : {}),
      ...(linkedPageId ? { linkedPageId } : {}),
      ...(linkedRecommendationId ? { linkedRecommendationId } : {}),
    };

    const tasks = await prisma.task.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        linkedRecommendation: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return successResponse(tasks);
  } catch {
    return errorResponse("Failed to fetch tasks.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createTaskSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid task payload.", 400, parsed.error.flatten());
    }

    const task = await prisma.task.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        linkedPageId: parsed.data.linkedPageId ?? null,
        linkedRecommendationId: parsed.data.linkedRecommendationId ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        status: TaskStatus.OPEN,
        ownerUserId: parsed.data.ownerUserId ?? null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      },
    });

    return createdResponse(task);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create task.", 400, error.message);
    }

    return errorResponse("Failed to create task.", 500);
  }
}
