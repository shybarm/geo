import { Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse } from "@/lib/api";
import { reconcileRecommendationsForPage } from "@/lib/reconcile-recommendations";

const reconcileRecommendationsSchema = z.object({
  workspaceId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = reconcileRecommendationsSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid recommendation payload.", 400, parsed.error.flatten());
    }

    const reconciled = await reconcileRecommendationsForPage(
      parsed.data.workspaceId,
      parsed.data.pageId,
    );

    return createdResponse(reconciled);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to reconcile recommendations.", 400, error.message);
    }

    return errorResponse("Failed to reconcile recommendations.", 500);
  }
}
