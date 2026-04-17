import { Prisma, RecommendationStatus, TaskPriority, TaskStatus } from "@prisma/client";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { writeChangeLog } from "@/lib/write-change-log";

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  ownerUserId: z.union([z.string().trim().min(1), z.literal(""), z.null()]).optional(),
  dueDate: z.union([z.string().datetime(), z.literal(""), z.null()]).optional(),
});

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { taskId } = await context.params;
    const json = await request.json();
    const parsed = updateTaskSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid task update payload.", 400, parsed.error.flatten());
    }

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return errorResponse("Task not found.", 404);
    }

    const data: Prisma.TaskUpdateInput = {};

    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description || null;
    if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.ownerUserId !== undefined) {
      data.ownerUser = parsed.data.ownerUserId
        ? { connect: { id: parsed.data.ownerUserId } }
        : { disconnect: true };
    }
    if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;

    const task = await prisma.task.update({
      where: { id: taskId },
      data,
    });

    // Sync linked recommendation status based on task status transition.
    // Resolution only happens through reconcile after a successful scan — never here.
    const newStatus = parsed.data.status;
    if (newStatus !== undefined && task.linkedRecommendationId) {
      const rec = await prisma.recommendation.findUnique({
        where: { id: task.linkedRecommendationId },
        select: { id: true, status: true },
      });

      if (rec) {
        if (newStatus === TaskStatus.IN_PROGRESS && rec.status === RecommendationStatus.OPEN) {
          // Task started → surface recommendation as in-progress
          await prisma.recommendation.update({
            where: { id: rec.id },
            data: { status: RecommendationStatus.IN_PROGRESS },
          });
        }
        // When task becomes DONE: recommendation stays IN_PROGRESS intentionally.
        // It only becomes RESOLVED once reconcile confirms the issue is gone via scan.
      }
    }

    await writeChangeLog({
      workspaceId: task.workspaceId,
      pageId: task.linkedPageId ?? null,
      objectType: "Task",
      objectId: task.id,
      actionType: "TASK_UPDATED",
      payloadJson: {
        status: task.status,
        priority: task.priority,
        linkedRecommendationId: task.linkedRecommendationId ?? null,
      },
    });

    return successResponse(task);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to update task.", 400, error.message);
    }

    return errorResponse("Failed to update task.", 500);
  }
}
