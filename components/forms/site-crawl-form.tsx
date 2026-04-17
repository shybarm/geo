"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CrawlSummary = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "partial" | "failed";
  crawledSourcePagesCount: number;
  discoveredInternalLinksCount: number;
  createdPageCount: number;
  createdVersionCount: number;
  completedScanCount: number;
  failedScanCount: number;
  nextStep: string | null;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SiteCrawlForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [maxPages, setMaxPages] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CrawlSummary | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSummary(null);

    const maxPagesInt = maxPages.trim() ? parseInt(maxPages.trim(), 10) : undefined;

    startTransition(async () => {
      const response = await fetch(`/api/sites/${siteId}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(maxPagesInt !== undefined ? { maxPages: maxPagesInt } : {}),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "Failed to crawl site.");
        return;
      }

      const data = (await response.json()) as { data: CrawlSummary };
      setSummary(data.data ?? (data as unknown as CrawlSummary));
      router.refresh();
    });
  }

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <input
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
        inputMode="numeric"
        onChange={(e) => setMaxPages(e.target.value)}
        placeholder="Max new pages (default 50)"
        type="number"
        value={maxPages}
        min={1}
        max={200}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {summary ? (
        <div className={`space-y-1.5 rounded-xl border p-3 text-xs ${
          summary.status === "completed"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : summary.status === "partial"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-800"
        }`}>
          <div className="flex flex-wrap items-center gap-3 font-medium">
            <span>
              Crawled {summary.crawledSourcePagesCount} · Found {summary.discoveredInternalLinksCount} links ·{" "}
              Created {summary.createdPageCount} · Scans {summary.completedScanCount} ok
            </span>
            {summary.failedScanCount > 0 ? (
              <span>{summary.failedScanCount} failed</span>
            ) : null}
            <span className="font-normal opacity-70">{formatDuration(summary.durationMs)}</span>
          </div>
          {summary.nextStep ? (
            <p className="italic opacity-75">{summary.nextStep}</p>
          ) : null}
        </div>
      ) : null}
      <button
        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Crawling..." : "Crawl internal links"}
      </button>
    </form>
  );
}
