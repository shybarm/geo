"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

type IngestResult = {
  siteId: string;
  discoveryMethodUsed: string;
  attemptedSources: string[];
  discoveredCount: number;
  createdPageCount: number;
  createdVersionCount: number;
  completedScanCount: number;
  failedScanCount: number;
};

type Stage = "idle" | "workspace" | "site" | "ingesting" | "done" | "error";

const METHOD_LABELS: Record<string, string> = {
  provided_sitemap: "provided sitemap URL",
  sitemap_xml: "/sitemap.xml",
  sitemap_index_xml: "/sitemap_index.xml",
  robots_txt: "robots.txt",
  homepage_fallback: "homepage (fallback)",
};

export function OnboardingForm() {
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIngestResult(null);

    const data = new FormData(event.currentTarget);
    const workspaceName = (data.get("workspaceName") as string).trim();
    const domain = (data.get("domain") as string).trim();
    const sitemapUrl = (data.get("sitemapUrl") as string | null)?.trim() || undefined;

    if (!workspaceName || !domain) {
      setError("Workspace name and site domain are required.");
      return;
    }

    startTransition(async () => {
      // Step 1 — create workspace
      setStage("workspace");
      const wsRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName }),
      });
      if (!wsRes.ok) {
        const p = (await wsRes.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(p?.error?.message ?? "Failed to create workspace.");
        setStage("error");
        return;
      }
      const workspace = (await wsRes.json()) as { id: string };

      // Step 2 — create site
      setStage("site");
      const siteRes = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          domain,
          sourceType: "SITEMAP",
        }),
      });
      if (!siteRes.ok) {
        const p = (await siteRes.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(p?.error?.message ?? "Failed to create site.");
        setStage("error");
        return;
      }
      const site = (await siteRes.json()) as { id: string };

      // Step 3 — discover + ingest + scan
      setStage("ingesting");
      const ingestRes = await fetch(`/api/sites/${site.id}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitemapUrl }),
      });
      if (!ingestRes.ok) {
        const p = (await ingestRes.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          p?.error?.message ??
            "Site was created but page discovery failed. You can retry from the Sites page.",
        );
        setStage("error");
        return;
      }
      const result = (await ingestRes.json()) as IngestResult;
      setIngestResult(result);
      setStage("done");
    });
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (stage === "done" && ingestResult) {
    const method =
      METHOD_LABELS[ingestResult.discoveryMethodUsed] ?? ingestResult.discoveryMethodUsed;
    const scansOk = ingestResult.completedScanCount > 0;
    const scansFailed = ingestResult.failedScanCount > 0;

    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-800">Site connected</p>
          <div className="space-y-1 text-sm text-emerald-700">
            <p>
              <span className="font-medium">{ingestResult.discoveredCount}</span> pages discovered
              via {method}
            </p>
            <p>
              <span className="font-medium">{ingestResult.createdPageCount}</span> pages created
              {scansOk ? (
                <>
                  {" · "}
                  <span className="font-medium">{ingestResult.completedScanCount}</span> scanned
                </>
              ) : null}
            </p>
            {scansFailed ? (
              <p className="text-amber-700">
                {ingestResult.failedScanCount} scan
                {ingestResult.failedScanCount !== 1 ? "s" : ""} failed — pages exist but need a
                rescan.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Open dashboard →
          </Link>
          <Link
            href="/pages"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Review pages →
          </Link>
        </div>
      </div>
    );
  }

  // ── Error state (after site was created) ──────────────────────────────────
  if (stage === "error" && error) {
    return (
      <div className="space-y-5">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Open dashboard →
          </Link>
          <Link
            href="/sites"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Retry from Sites →
          </Link>
        </div>
      </div>
    );
  }

  // ── Idle / in-progress form ───────────────────────────────────────────────
  const stageLabel =
    stage === "workspace"
      ? "Creating workspace…"
      : stage === "site"
        ? "Adding site…"
        : stage === "ingesting"
          ? "Discovering and importing pages…"
          : "Connect site";

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="workspaceName">
          Workspace name
        </label>
        <input
          autoFocus
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30 disabled:opacity-60"
          disabled={isPending}
          id="workspaceName"
          name="workspaceName"
          placeholder="My Company"
          required
          type="text"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="domain">
          Site domain
        </label>
        <input
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30 disabled:opacity-60"
          disabled={isPending}
          id="domain"
          name="domain"
          placeholder="example.com"
          required
          type="text"
        />
        <p className="text-xs text-muted-foreground">
          Pages are auto-discovered from your sitemap. No setup required.
        </p>
      </div>

      <div>
        <button
          className="text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
          disabled={isPending}
          onClick={() => setShowAdvanced((v) => !v)}
          type="button"
        >
          {showAdvanced ? "Hide advanced options" : "Advanced options"}
        </button>
        {showAdvanced ? (
          <div className="mt-3 space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="sitemapUrl">
              Sitemap URL{" "}
              <span className="font-normal text-muted-foreground">(optional override)</span>
            </label>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30 disabled:opacity-60"
              disabled={isPending}
              id="sitemapUrl"
              name="sitemapUrl"
              placeholder="https://example.com/sitemap.xml"
              type="url"
            />
          </div>
        ) : null}
      </div>

      <button
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {stageLabel}
      </button>
    </form>
  );
}
