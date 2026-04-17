import Link from "next/link";

import { BulkReauditForm } from "@/components/forms/bulk-reaudit-form";
import { ScanRetryForm } from "@/components/forms/scan-retry-form";
import { ScanTriggerForm } from "@/components/forms/scan-trigger-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type RouteProps = {
  searchParams?: Promise<{
    siteId?: string;
    status?: string;
    failedOnly?: string;
  }>;
};

type Workspace = {
  id: string;
  name: string;
};

type Site = {
  id: string;
  workspaceId: string;
  domain: string;
};

type Page = {
  id: string;
  siteId: string;
  workspaceId: string;
  title: string | null;
  path: string;
};

type ScoreSnapshotRecord = {
  id: string;
  overallScore: string | number | null;
  blockersCount: number;
};

type ScanRecord = {
  id: string;
  pageId: string | null;
  page: {
    id: string;
    title: string | null;
    path: string;
    siteId: string;
  } | null;
  status: string;
  triggerType: string;
  failureCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  scoreSnapshot: ScoreSnapshotRecord | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatScore(value: string | number | null) {
  if (value === null) {
    return "-";
  }

  return typeof value === "number" ? value.toFixed(2) : value;
}

function buildScansApiPath(filters: { siteId?: string; status?: string; failedOnly?: string }) {
  const params = new URLSearchParams();
  if (filters.siteId) params.set("siteId", filters.siteId);
  if (filters.failedOnly === "true") {
    params.set("status", "FAILED");
  } else if (filters.status) {
    params.set("status", filters.status);
  }
  const query = params.toString();
  return query ? `/api/scans?${query}` : "/api/scans";
}

function buildPagesApiPath(filters: { siteId?: string }) {
  const params = new URLSearchParams();
  if (filters.siteId) params.set("siteId", filters.siteId);
  params.set("freshness", "never");
  return `/api/pages?${params.toString()}`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "FAILED":
      return "border-red-300 bg-red-50 text-red-700";
    case "COMPLETED":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    case "RUNNING":
      return "border-blue-300 bg-blue-50 text-blue-700";
    default:
      return "border-border bg-secondary text-foreground";
  }
}

function SummaryCard({
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
      className={`rounded-2xl border p-5 shadow-soft ${
        warn && value > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-card"
      }`}
    >
      <p className={`text-sm ${warn && value > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight ${
          warn && value > 0 ? "text-amber-800" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function ScansRoute({ searchParams }: RouteProps) {
  const filters = (await searchParams) ?? undefined;
  const siteId = filters?.siteId?.trim();
  const statusFilter = filters?.status?.trim();
  const failedOnly = filters?.failedOnly === "true";
  const effectiveStatus = failedOnly ? "FAILED" : statusFilter;

  const [pages, workspaces, sites, scans, scopedScans, neverScannedPages] = await Promise.all([
    apiFetch<Page[]>(siteId ? `/api/pages?siteId=${siteId}` : "/api/pages"),
    apiFetch<Workspace[]>("/api/workspaces"),
    apiFetch<Site[]>("/api/sites"),
    apiFetch<ScanRecord[]>(buildScansApiPath({ siteId, status: effectiveStatus })),
    apiFetch<ScanRecord[]>(buildScansApiPath({ siteId })),
    apiFetch<Page[]>(buildPagesApiPath({ siteId })),
  ]);

  const siteMap = new Map(sites.map((site) => [site.id, site.domain]));
  const totalScans = scopedScans.length;
  const failedScans = scopedScans.filter((scan) => scan.status === "FAILED").length;
  const completedScans = scopedScans.filter((scan) => scan.status === "COMPLETED").length;
  const neverScannedCount = neverScannedPages.length;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Scans</h1>
        <p className="text-sm text-muted-foreground">Review failed scans, retry pages truthfully, and close recovery gaps.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total scans" value={totalScans} />
        <SummaryCard label="Failed scans" value={failedScans} warn />
        <SummaryCard label="Completed scans" value={completedScans} />
        <SummaryCard label="Pages never scanned" value={neverScannedCount} warn />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Recovery filters</h2>
          <p className="text-sm text-muted-foreground">Focus the queue by site and scan outcome.</p>
        </div>
        <form action="/scans" className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Site</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              defaultValue={siteId ?? ""}
              name="siteId"
            >
              <option value="">All sites</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.domain}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Status</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              defaultValue={failedOnly ? "" : statusFilter ?? ""}
              name="status"
            >
              <option value="">All statuses</option>
              <option value="FAILED">FAILED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="RUNNING">RUNNING</option>
              <option value="QUEUED">QUEUED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </label>
          <label className="flex items-end gap-3 rounded-xl border border-border bg-background px-3 py-3">
            <input defaultChecked={failedOnly} name="failedOnly" type="checkbox" value="true" />
            <span className="text-sm font-medium text-foreground">Failed only</span>
          </label>
          <div className="flex items-end gap-2">
            <button
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              type="submit"
            >
              Apply filters
            </button>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
              href="/scans"
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      <BulkReauditForm workspaces={workspaces} sites={sites} />

      <ScanTriggerForm pages={pages} workspaces={workspaces} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Scan Runs</h2>
        </div>

        {scans.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">
              {totalScans === 0
                ? "No scans yet"
                : failedOnly && failedScans === 0
                  ? "No failed scans"
                  : "No scans match these filters"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {totalScans === 0
                ? pages.length === 0
                  ? "Create a page first."
                  : "Run the first scan for a page with a current live version."
                : failedOnly && failedScans === 0
                  ? "This scope has no failed scans to retry right now."
                  : "Adjust the site or status filter to view more scan runs."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Page</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Site</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Trigger Type</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Failure</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Completed</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {scans.map((scan) => {
                  const pageLabel = scan.page?.title?.trim() || scan.page?.path || scan.pageId || "-";
                  const siteLabel = scan.page?.siteId ? (siteMap.get(scan.page.siteId) ?? scan.page.siteId) : "-";
                  const failureSummary = scan.failureCode
                    ? `${scan.failureCode}${scan.errorMessage ? ` · ${scan.errorMessage}` : ""}`
                    : scan.errorMessage ?? "-";

                  return (
                    <tr key={scan.id}>
                      <td className="px-6 py-4">
                        {scan.pageId ? (
                          <Link className="font-medium text-foreground hover:underline" href={`/pages/${scan.pageId}`}>
                            {pageLabel}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">{pageLabel}</span>
                        )}
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {scan.page?.path ?? scan.pageId ?? "-"}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{siteLabel}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(scan.status)}`}>
                          {scan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{scan.triggerType}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {scan.scoreSnapshot ? (
                          <div className="space-y-1">
                            <p>{formatScore(scan.scoreSnapshot.overallScore)}</p>
                            <p className="text-xs">Blockers {scan.scoreSnapshot.blockersCount}</p>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {scan.status === "FAILED" ? (
                          <span className="text-red-700">{failureSummary}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDateTime(scan.completedAt)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDateTime(scan.createdAt)}</td>
                      <td className="px-6 py-4">
                        {scan.status === "FAILED" ? <ScanRetryForm scanId={scan.id} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
