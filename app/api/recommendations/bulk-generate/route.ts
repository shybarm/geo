import { z } from "zod";

import { createdResponse, errorResponse } from "@/lib/api";
import { createJobTimer, deriveJobStatus } from "@/lib/jobs";
import { executeBulkRecommendations } from "@/lib/job-runner";

const bulkGenerateSchema = z.object({
  workspaceId: z.string().trim().min(1),
  siteId: z.string().trim().min(1).optional(),
  pageIds: z.array(z.string().trim().min(1)).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bulkGenerateSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid bulk recommendation payload.", 400, parsed.error.flatten());
    }

    const timer = createJobTimer();

    const result = await executeBulkRecommendations(parsed.data.workspaceId, {
      siteId: parsed.data.siteId,
      pageIds: parsed.data.pageIds,
    });

    const timing = timer.stop();
    const status = deriveJobStatus(result.processedPagesCount, result.failedPagesCount);
    const nextStep =
      result.failedPagesCount > 0
        ? `${result.failedPagesCount} page(s) failed — retry individually or re-run bulk generation.`
        : result.processedPagesCount > 0
          ? "Recommendations created. Open pages to review and act on active batches."
          : result.skippedAlreadyCoveredCount > 0
            ? "All eligible pages already have active recommendation batches."
            : "No eligible pages found. Scan pages first before generating recommendations.";

    return createdResponse({
      startedAt: timing.startedAt,
      completedAt: timing.completedAt,
      durationMs: timing.durationMs,
      status,
      eligiblePagesCount: result.eligiblePagesCount,
      processedPagesCount: result.processedPagesCount,
      createdBatchesCount: result.createdBatchesCount,
      createdRecommendationsCount: result.createdRecommendationsCount,
      skippedAlreadyCoveredCount: result.skippedAlreadyCoveredCount,
      skippedNoSuccessfulScanCount: result.skippedNoSuccessfulScanCount,
      failedPagesCount: result.failedPagesCount,
      failedPageIds: result.failedPageIds,
      nextStep,
    });
  } catch {
    return errorResponse("Failed to bulk generate recommendations.", 500);
  }
}
