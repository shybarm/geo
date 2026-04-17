import { ScanTriggerType } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse } from "@/lib/api";
import { createJobTimer, deriveJobStatus } from "@/lib/jobs";
import { resolveReauditTargets, runScansForPages } from "@/lib/job-runner";

const reAuditSchema = z.object({
  workspaceId: z.string().trim().min(1),
  siteId: z.string().trim().min(1).optional(),
  pageIds: z.array(z.string().trim().min(1)).optional(),
  /**
   * "all"          – rescan every page that has a current live version (default)
   * "never_scanned" – only pages that have never had a successful scan
   */
  scope: z.enum(["all", "never_scanned"]).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = reAuditSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid re-audit payload.", 400, parsed.error.flatten());
    }

    const { workspaceId, siteId, pageIds, scope = "all" } = parsed.data;
    const timer = createJobTimer();

    // Resolve which pages to rescan
    const targetPageIds = await resolveReauditTargets({
      workspaceId,
      siteId,
      pageIds,
      scope,
    });

    if (targetPageIds.length === 0) {
      const timing = timer.stop();
      return createdResponse({
        startedAt: timing.startedAt,
        completedAt: timing.completedAt,
        durationMs: timing.durationMs,
        status: "completed",
        targetPagesCount: 0,
        processedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        nextStep:
          scope === "never_scanned"
            ? "No pages found without a successful scan. All pages are already scanned."
            : "No scannable pages found. Ensure pages have a current live version.",
      });
    }

    const scanBatch = await runScansForPages(
      workspaceId,
      targetPageIds,
      ScanTriggerType.MANUAL_RESCAN,
    );

    const timing = timer.stop();
    const status = deriveJobStatus(scanBatch.completedCount, scanBatch.failedCount);
    const nextStep =
      scanBatch.failedCount > 0
        ? `${scanBatch.failedCount} scan(s) failed — check individual pages for fetch errors or missing live versions.`
        : scanBatch.completedCount > 0
          ? "Re-audit complete. Run bulk recommendation generation to update recommendation batches."
          : "No scans ran. All target pages may be missing live versions.";

    return createdResponse({
      startedAt: timing.startedAt,
      completedAt: timing.completedAt,
      durationMs: timing.durationMs,
      status,
      targetPagesCount: targetPageIds.length,
      processedCount: scanBatch.completedCount,
      failedCount: scanBatch.failedCount,
      skippedCount: 0,
      failedPageIds: scanBatch.failedPageIds,
      nextStep,
    });
  } catch {
    return errorResponse("Failed to run re-audit.", 500);
  }
}
