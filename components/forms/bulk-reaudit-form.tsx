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

type ReauditResult = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "partial" | "failed";
  targetPagesCount: number;
  processedCount: number;
  failedCount: number;
  skippedCount: number;
  nextStep: string | null;
};

type Props = {
  workspaces: Workspace[];
  sites: Site[];
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function BulkReauditForm({ workspaces, sites }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [scope, setScope] = useState<"all" | "never_scanned">("never_scanned");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReauditResult | null>(null);

  const availableSites = useMemo(
    () => sites.filter((s) => s.workspaceId === workspaceId),
    [sites, workspaceId],
  );

  function handleWorkspaceChange(id: string) {
    setWorkspaceId(id);
    setSiteId("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await fetch("/api/pages/re-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          siteId: siteId || undefined,
          scope,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "Failed to run re-audit.");
        return;
      }

      const wrapper = (await response.json()) as { data: ReauditResult };
      setResult(wrapper.data ?? (wrapper as unknown as ReauditResult));
      router.refresh();
    });
  }

  const statusColor =
    result?.status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result?.status === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Bulk re-audit</h2>
        <p className="text-sm text-muted-foreground">
          Run page scans in batch for pages that need attention.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Workspace</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(e) => handleWorkspaceChange(e.target.value)}
              required
              value={workspaceId}
            >
              <option value="">Select workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Site scope</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(e) => setSiteId(e.target.value)}
              value={siteId}
            >
              <option value="">All sites in workspace</option>
              {availableSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.domain}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Target</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(e) => setScope(e.target.value as "all" | "never_scanned")}
              value={scope}
            >
              <option value="never_scanned">Never scanned only</option>
              <option value="all">All pages with live version</option>
            </select>
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {result ? (
          <div className={`rounded-xl border p-4 text-sm ${statusColor}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {result.targetPagesCount} targeted · {result.processedCount} completed
                {result.failedCount > 0 ? ` · ${result.failedCount} failed` : ""}
              </p>
              <span className="text-xs opacity-70">{formatDuration(result.durationMs)}</span>
            </div>
            {result.nextStep ? (
              <p className="mt-1 text-xs italic opacity-75">{result.nextStep}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !workspaceId}
            type="submit"
          >
            {isPending ? "Re-auditing…" : "Run bulk re-audit"}
          </button>
        </div>
      </form>
    </section>
  );
}
