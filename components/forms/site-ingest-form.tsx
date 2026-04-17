"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type IngestResult = {
  siteId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "partial" | "failed";
  discoveredCount: number;
  createdPageCount: number;
  createdVersionCount: number;
  completedScanCount: number;
  failedScanCount: number;
  discoveryMethodUsed?: string;
  attemptedSources?: string[];
  nextStep: string | null;
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const METHOD_LABELS: Record<string, string> = {
  provided_sitemap: "provided sitemap URL",
  sitemap_xml: "/sitemap.xml",
  sitemap_index_xml: "/sitemap_index.xml",
  robots_txt: "robots.txt",
  homepage_fallback: "homepage (fallback)",
};

export function SiteIngestForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await fetch(`/api/sites/${siteId}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitemapUrl: sitemapUrl.trim() || undefined }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "Failed to ingest site.");
        return;
      }

      const data = (await response.json()) as { data: IngestResult };
      setSitemapUrl("");
      setShowAdvanced(false);
      setResult(data.data);
      router.refresh();
    });
  }

  const methodLabel = result?.discoveryMethodUsed
    ? (METHOD_LABELS[result.discoveryMethodUsed] ?? result.discoveryMethodUsed)
    : null;

  const statusColor =
    result?.status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : result?.status === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-red-200 bg-red-50 text-red-800";

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <div>
        <button
          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
          disabled={isPending}
          onClick={() => setShowAdvanced((v) => !v)}
          type="button"
        >
          {showAdvanced ? "Hide sitemap URL" : "Use custom sitemap URL"}
        </button>
        {showAdvanced ? (
          <input
            className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
            disabled={isPending}
            onChange={(event) => setSitemapUrl(event.target.value)}
            placeholder="https://example.com/sitemap.xml (optional)"
            type="url"
            value={sitemapUrl}
          />
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {result ? (
        <div className={`space-y-1.5 rounded-xl border p-3 text-xs ${statusColor}`}>
          <div className="flex flex-wrap items-center gap-3 font-medium">
            <span>
              {result.discoveredCount} discovered · {result.createdPageCount} created ·{" "}
              {result.completedScanCount} scanned
            </span>
            {result.failedScanCount > 0 ? (
              <span>{result.failedScanCount} scan(s) failed</span>
            ) : null}
            <span className="font-normal opacity-70">{formatDuration(result.durationMs)}</span>
          </div>
          {methodLabel ? <p className="opacity-80">Via {methodLabel}</p> : null}
          {result.nextStep ? <p className="italic opacity-75">{result.nextStep}</p> : null}
          <div className="flex flex-wrap gap-3 pt-0.5">
            <Link href="/pages" className="font-medium underline-offset-2 hover:underline">
              Review pages →
            </Link>
            <Link href="/scans" className="font-medium underline-offset-2 hover:underline">
              View scans →
            </Link>
          </div>
        </div>
      ) : null}

      <button
        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Ingesting…" : "Ingest site"}
      </button>
    </form>
  );
}
