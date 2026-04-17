import Link from "next/link";

import { SiteCreateForm } from "@/components/forms/site-create-form";
import { SiteCrawlForm } from "@/components/forms/site-crawl-form";
import { SiteIngestForm } from "@/components/forms/site-ingest-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type Workspace = {
  id: string;
  name: string;
};

type Site = {
  id: string;
  workspaceId: string;
  domain: string;
  sourceType: string;
  crawlStatus: string;
  createdAt: string;
};

type SiteSetupStatus = {
  siteId: string;
  domain: string;
  crawlStatus: string;
  totalPages: number;
  livePagesCount: number;
  scannedPagesCount: number;
  successfulScansCount: number;
  failedScansCount: number;
  neverScannedPagesCount: number;
  pagesWithRecommendationsCount: number;
  pagesWithBlockersCount: number;
  pagesNeedingRecommendationsCount: number;
  setupState: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function crawlStatusBadgeClass(status: string) {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "RUNNING":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "FAILED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-secondary text-foreground";
  }
}

function setupStateClass(setupState: string, hasFailures: boolean) {
  if (hasFailures || setupState === "Needs review") {
    return "border-amber-300 bg-amber-50 text-amber-800";
  }

  if (setupState === "Ready for optimization") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  if (setupState === "Partially ready") {
    return "border-blue-300 bg-blue-50 text-blue-700";
  }

  return "border-border bg-secondary text-foreground";
}

function setupMessage(setup: SiteSetupStatus) {
  if (setup.totalPages === 0) {
    return "Run site ingest to discover pages and create the first live registry entries.";
  }

  if (setup.failedScansCount > 0) {
    return "Review failed scans before treating this site as ready.";
  }

  if (setup.neverScannedPagesCount > 0) {
    return "Review scan gaps — some live pages still do not have a successful scan.";
  }

  if (setup.pagesWithBlockersCount > 0) {
    return "Pages with blockers need attention before deeper optimization work.";
  }

  if (setup.pagesNeedingRecommendationsCount > 0) {
    return "Generate recommendations for scanned pages that still do not have an active recommendation batch.";
  }

  if (setup.crawlStatus === "RUNNING" || setup.crawlStatus === "QUEUED") {
    return "Site setup is still in progress.";
  }

  return "This site is ready for optimization review.";
}

function MetricCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        warn && value > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-background"
      }`}
    >
      <p className={`text-xs ${warn && value > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tracking-tight ${
          warn && value > 0 ? "text-amber-800" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function SitesPage() {
  const [sites, workspaces] = await Promise.all([
    apiFetch<Site[]>("/api/sites"),
    apiFetch<Workspace[]>("/api/workspaces"),
  ]);

  const setupMap = new Map<string, SiteSetupStatus>();
  if (sites.length > 0) {
    const results = await Promise.allSettled(
      sites.map((site) => apiFetch<SiteSetupStatus>(`/api/sites/${site.id}/setup-status`)),
    );
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        setupMap.set(sites[i].id, result.value);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sites</h1>
        <p className="text-sm text-muted-foreground">Manage tracked sites across workspaces.</p>
      </div>

      <SiteCreateForm workspaces={workspaces} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Site registry</h2>
        </div>

        {sites.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-base font-medium text-foreground">No sites yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {workspaces.length === 0
                ? "Create a workspace first, then add a site."
                : "Add your first site above."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sites.map((site) => {
              const setup = setupMap.get(site.id);
              const hasPages = setup !== undefined && setup.totalPages > 0;
              const noPages = setup !== undefined && setup.totalPages === 0;
              const hasFailures = (setup?.failedScansCount ?? 0) > 0 || site.crawlStatus === "FAILED";
              const shouldReviewScanGaps =
                (setup?.neverScannedPagesCount ?? 0) > 0 && (setup?.totalPages ?? 0) > 0;
              const message = setup ? setupMessage(setup) : "Setup status unavailable.";

              return (
                <div key={site.id} className="px-6 py-5 space-y-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-semibold text-foreground">{site.domain}</p>
                      <p className="text-xs text-muted-foreground">
                        {site.sourceType} &middot; added {formatDate(site.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${crawlStatusBadgeClass(site.crawlStatus)}`}
                      >
                        {site.crawlStatus}
                      </span>
                      {setup ? (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium ${setupStateClass(setup.setupState, hasFailures)}`}
                        >
                          {setup.setupState}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {setup ? (
                    <section
                      className={`rounded-2xl border p-4 shadow-soft ${
                        hasFailures
                          ? "border-amber-300 bg-amber-50"
                          : noPages
                            ? "border-blue-200 bg-blue-50"
                            : shouldReviewScanGaps
                              ? "border-amber-300 bg-amber-50"
                              : "border-border bg-secondary/30"
                      }`}
                    >
                      <div className="space-y-2">
                        <p
                          className={`text-sm font-medium ${
                            hasFailures || shouldReviewScanGaps || noPages
                              ? "text-amber-800"
                              : "text-foreground"
                          }`}
                        >
                          {message}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <MetricCard label="Total pages" value={setup.totalPages} />
                          <MetricCard label="Scanned" value={setup.scannedPagesCount} />
                          <MetricCard label="Failed scans" value={setup.failedScansCount} warn />
                          <MetricCard label="Never scanned" value={setup.neverScannedPagesCount} warn />
                          <MetricCard label="Blockers" value={setup.pagesWithBlockersCount} warn />
                          <MetricCard
                            label="Need recommendations"
                            value={setup.pagesNeedingRecommendationsCount}
                            warn
                          />
                        </div>
                      </div>
                    </section>
                  ) : null}

                  <div className="flex flex-wrap gap-8 border-t border-border pt-4">
                    <div className="min-w-[220px] space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Ingest site</p>
                      <SiteIngestForm siteId={site.id} />
                    </div>
                    {hasPages ? (
                      <div className="min-w-[220px] space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Crawl internal links
                        </p>
                        <SiteCrawlForm siteId={site.id} />
                      </div>
                    ) : null}
                    <div className="min-w-[260px] space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Next actions</p>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/pages?siteId=${site.id}`}
                          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-secondary"
                        >
                          Review pages
                        </Link>
                        <Link
                          href={`/scans?siteId=${site.id}&status=FAILED`}
                          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-secondary"
                        >
                          Review failed scans
                        </Link>
                        <Link
                          href={`/sites/${site.id}/coverage`}
                          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-secondary"
                        >
                          Open coverage
                        </Link>
                        <Link
                          href="/dashboard"
                          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-secondary"
                        >
                          Open dashboard
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
