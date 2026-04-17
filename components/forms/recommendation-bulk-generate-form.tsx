"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Workspace = {
  id: string;
  name: string;
};

type Site = {
  id: string;
  workspaceId: string;
  domain: string;
};

type BulkGenerateResult = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "partial" | "failed";
  eligiblePagesCount: number;
  processedPagesCount: number;
  createdBatchesCount: number;
  createdRecommendationsCount: number;
  skippedAlreadyCoveredCount: number;
  skippedNoSuccessfulScanCount: number;
  failedPagesCount: number;
  failedPageIds: string[];
  nextStep: string | null;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type RecommendationBulkGenerateFormProps = {
  workspaces: Workspace[];
  sites: Site[];
};

export function RecommendationBulkGenerateForm({
  workspaces,
  sites,
}: RecommendationBulkGenerateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkGenerateResult | null>(null);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [siteId, setSiteId] = useState("");

  const availableSites = useMemo(
    () => sites.filter((site) => site.workspaceId === workspaceId),
    [sites, workspaceId],
  );

  function handleWorkspaceChange(nextWorkspaceId: string) {
    setWorkspaceId(nextWorkspaceId);
    setSiteId("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await fetch("/api/recommendations/bulk-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          siteId: siteId || undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Failed to generate recommendations.");
        return;
      }

      const wrapper = (await response.json()) as { data: BulkGenerateResult };
      setResult(wrapper.data ?? (wrapper as unknown as BulkGenerateResult));
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Generate missing recommendations</h2>
        <p className="text-sm text-muted-foreground">
          Fill recommendation coverage gaps for scanned pages that do not yet have an active batch.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Workspace</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => handleWorkspaceChange(event.target.value)}
              required
              value={workspaceId}
            >
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Site scope</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setSiteId(event.target.value)}
              value={siteId}
            >
              <option value="">All sites in workspace</option>
              {availableSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.domain}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {result ? (
          <div className={`rounded-xl border p-4 text-sm ${
            result.status === "completed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : result.status === "partial"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-800"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {result.processedPagesCount} of {result.eligiblePagesCount} processed ·{" "}
                {result.createdRecommendationsCount} recommendations created
              </p>
              <span className="text-xs opacity-70">{formatDuration(result.durationMs)}</span>
            </div>
            <p className="mt-1 text-xs opacity-80">
              Skipped {result.skippedAlreadyCoveredCount} covered · {result.skippedNoSuccessfulScanCount} without scan
              {result.failedPagesCount > 0
                ? ` · ${result.failedPagesCount} failed`
                : ""}
            </p>
            {result.nextStep ? (
              <p className="mt-1 text-xs italic opacity-75">{result.nextStep}</p>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Generating..." : "Generate missing recommendations"}
          </button>
        </div>
      </form>
    </section>
  );
}
