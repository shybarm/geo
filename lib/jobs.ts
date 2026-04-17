/**
 * Minimal job orchestration types for GEO OS.
 *
 * Execution is synchronous and in-process. The DB is the single source of truth
 * for all results. No external queue infrastructure is required.
 */

export type JobType =
  | "site_ingest"
  | "site_crawl"
  | "page_rescan"
  | "bulk_recommendation_generate";

export type JobStatus = "completed" | "partial" | "failed";

export type JobTiming = {
  /** ISO 8601 */
  startedAt: string;
  /** ISO 8601 */
  completedAt: string;
  durationMs: number;
};

export type JobTimer = {
  startedAt: string;
  stop: () => JobTiming;
};

/**
 * Create a lightweight wall-clock timer. Call `.stop()` to get timing info.
 */
export function createJobTimer(): JobTimer {
  const wallStart = Date.now();
  const startedAt = new Date(wallStart).toISOString();
  return {
    startedAt,
    stop(): JobTiming {
      const wallEnd = Date.now();
      return {
        startedAt,
        completedAt: new Date(wallEnd).toISOString(),
        durationMs: wallEnd - wallStart,
      };
    },
  };
}

/**
 * Derive a job status from processed/failed counts.
 * - All failed → "failed"
 * - Some failed → "partial"
 * - None failed → "completed"
 */
export function deriveJobStatus(processed: number, failed: number): JobStatus {
  if (processed === 0 && failed > 0) return "failed";
  if (failed > 0) return "partial";
  return "completed";
}
