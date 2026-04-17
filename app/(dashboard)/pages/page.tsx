import Link from "next/link";

import { PageCreateForm } from "@/components/forms/page-create-form";
import { ReconcileDuplicatesForm } from "@/components/forms/reconcile-duplicates-form";
import { apiFetch } from "@/lib/api-client";
import { parseCrawlSourceSummary } from "@/lib/crawl-source";

export const dynamic = "force-dynamic";

type Workspace = {
  id: string;
  name: string;
};

type Site = {
  id: string;
  workspaceId: string;
  domain: string;
};

type PageRecord = {
  id: string;
  siteId: string;
  title: string | null;
  path: string;
  pageType: string | null;
  lifecycleStatus: string;
  sourceStatus: string;
  existsLive: boolean;
  currentLivePageVersionId: string | null;
  latestSuccessfulScanRunId: string | null;
  latestSuccessfulScoreSnapshotId: string | null;
  updatedAt: string;
  currentLivePageVersion: {
    extractedJson: unknown;
  } | null;
  latestSuccessfulScanRun: { completedAt: string | null } | null;
  latestSuccessfulScoreSnapshot: {
    overallScore: string | number | null;
  } | null;
  _count: {
    recommendations: number;
  };
};

type RouteProps = {
  searchParams?: Promise<{
    siteId?: string;
    lifecycleStatus?: string;
    hasScan?: string;
    hasRecommendations?: string;
    freshness?: string;
  }>;
};

type LinkOpportunityItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  sourceStatus: string;
  updatedAt: string;
  internalLinkCount: number | null;
  latestOverallScore: number | null;
  discoveredFromCount: number;
  discoveredFromPaths: string[];
  orphanLike: boolean;
};

type SchemaOpportunityItem = {
  id: string;
  title: string | null;
  path: string;
  structuredDataPresent: boolean | null;
  schemaHints: string[];
  hasFaqSection: boolean | null;
  indexabilityHint: string | null;
  canonicalMatchesUrl: boolean | null;
  gaps: string[];
};

type SchemaOpportunities = {
  scannedPagesCount: number;
  pagesMissingStructuredDataCount: number;
  pagesWithWeakSchemaSupportCount: number;
  faqPagesMissingFaqSchemaCount: number;
  authorityPagesMissingAuthoritySchemaCount: number;
  pagesWithCanonicalOrIndexabilityRiskCount: number;
  pagesMissingStructuredData: SchemaOpportunityItem[];
  pagesWithWeakSchemaSupport: SchemaOpportunityItem[];
  faqPagesMissingFaqSchema: SchemaOpportunityItem[];
  authorityPagesMissingAuthoritySchema: SchemaOpportunityItem[];
  pagesWithCanonicalOrIndexabilityRisk: SchemaOpportunityItem[];
};

type LinkOpportunities = {
  thresholds: { weakLink: number; strongText: number; strongHeading: number };
  orphanInferenceAvailable: boolean;
  weaklyLinkedPagesCount: number;
  orphanLikePagesCount: number;
  faqLikePagesCount: number;
  topLinkCandidatesCount: number;
  weaklyLinkedPages: LinkOpportunityItem[];
  orphanLikePages: LinkOpportunityItem[];
  faqLikePagesWithoutLinks: LinkOpportunityItem[];
  topLinkCandidates: LinkOpportunityItem[];
};

type DuplicatePageItem = {
  id: string;
  title: string | null;
  url: string;
  canonicalUrl: string | null;
  path: string;
  slug: string;
  pageType: string | null;
  lifecycleStatus: string;
  existsLive: boolean;
  currentLivePageVersionId: string | null;
  latestSuccessfulScanRunId: string | null;
  latestOverallScore: number | null;
  updatedAt: string;
};

type DuplicateGroup = {
  groupKey: string;
  siteId: string;
  pageCount: number;
  suggestedPrimaryPageId: string;
  pages: DuplicatePageItem[];
};

type DuplicateReview = {
  duplicateGroupsCount: number;
  duplicatePagesCount: number;
  groups: DuplicateGroup[];
};

type DraftQueueItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  lifecycleStatus: string;
  existsLive: boolean;
  updatedAt: string;
  currentLivePageVersionId: string | null;
  latestDraftVersionId: string | null;
  latestSuccessfulScanAt: string | null;
  latestOverallScore: number | null;
  activeRecommendationCount: number;
  readinessState: string;
};

type DraftQueue = {
  totalDraftPages: number;
  draftOnlyPagesCount: number;
  pagesWithDraftReadyToApplyCount: number;
  pagesNeedingVerifyCount: number;
  pagesNeedingScanCount: number;
  pagesNeedingReconcileCount: number;
  draftOnlyPages: DraftQueueItem[];
  draftReadyToApply: DraftQueueItem[];
  pagesNeedingVerify: DraftQueueItem[];
  pagesNeedingScan: DraftQueueItem[];
  pagesNeedingReconcile: DraftQueueItem[];
};

const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function freshnessLabel(page: PageRecord): "fresh" | "stale" | "never" | null {
  if (!page.currentLivePageVersionId) return null;
  if (!page.latestSuccessfulScanRun?.completedAt) return "never";
  const age = Date.now() - new Date(page.latestSuccessfulScanRun.completedAt).getTime();
  if (age <= FRESH_MS) return "fresh";
  if (age > STALE_MS) return "stale";
  return null; // between 7–14 days: no label
}

const lifecycleLabels: Record<string, string> = {
  ACTIVE: "Active",
  DISCOVERED: "Discovered",
  DRAFT_ONLY: "Draft only",
  ARCHIVED: "Archived",
  ERROR: "Error",
};

const lifecycleOptions = Object.keys(lifecycleLabels);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatScore(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return typeof value === "number" ? value.toFixed(2) : value;
}

function crawlSummary(page: Pick<PageRecord, "currentLivePageVersion" | "sourceStatus">) {
  return parseCrawlSourceSummary(page.currentLivePageVersion?.extractedJson ?? null);
}

function inboundLabel(page: PageRecord) {
  const summary = crawlSummary(page);
  if (!summary.inferenceAvailable) return "Not enough crawl data";
  if (summary.orphanLike) return "Orphan-like";
  if (summary.discoveredFromCount > 0) {
    return `${summary.discoveredFromCount} source${summary.discoveredFromCount === 1 ? "" : "s"}`;
  }
  return page.sourceStatus === "CRAWLED" ? "No inbound sources" : "Seed or direct page";
}

function buildPagesPath(filters: {
  siteId?: string;
  lifecycleStatus?: string;
  hasScan?: string;
  hasRecommendations?: string;
  freshness?: string;
}) {
  const params = new URLSearchParams();
  if (filters.siteId) params.set("siteId", filters.siteId);
  if (filters.lifecycleStatus) params.set("lifecycleStatus", filters.lifecycleStatus);
  if (filters.hasScan === "true") params.set("hasScan", "true");
  if (filters.hasRecommendations === "true") params.set("hasRecommendations", "true");
  if (filters.freshness) params.set("freshness", filters.freshness);
  const query = params.toString();
  return query ? `/pages?${query}` : "/pages";
}

function FreshnessBadge({ label }: { label: "fresh" | "stale" | "never" }) {
  if (label === "fresh")
    return (
      <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Fresh
      </span>
    );
  if (label === "stale")
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        Stale
      </span>
    );
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
      Never scanned
    </span>
  );
}

function readinessLabel(page: PageRecord): {
  label: string;
  variant: "draft" | "warn" | "info" | "neutral" | "active";
} {
  if (page.lifecycleStatus === "DRAFT_ONLY" && !page.currentLivePageVersionId) {
    return { label: "Draft only", variant: "draft" };
  }
  if (page.currentLivePageVersionId && !page.existsLive) {
    return { label: "Ready to verify", variant: "warn" };
  }
  if (page.existsLive && !page.latestSuccessfulScanRunId) {
    return { label: "Ready to scan", variant: "info" };
  }
  if (page.latestSuccessfulScanRunId && page._count.recommendations === 0) {
    return { label: "Ready to reconcile", variant: "info" };
  }
  return { label: "Active live", variant: "active" };
}

function ReadinessChip({ page }: { page: PageRecord }) {
  const { label, variant } = readinessLabel(page);
  const styles: Record<typeof variant, string> = {
    draft: "border-amber-300 bg-amber-50 text-amber-700",
    warn: "border-orange-300 bg-orange-50 text-orange-700",
    info: "border-blue-300 bg-blue-50 text-blue-700",
    neutral: "border-border bg-secondary text-foreground",
    active: "border-emerald-300 bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}

function LifecycleBadge({ status }: { status: string }) {
  const isDraft = status === "DRAFT_ONLY";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
        isDraft
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-border bg-secondary text-foreground"
      }`}
    >
      {lifecycleLabels[status] ?? status}
    </span>
  );
}

export default async function PagesRoute({ searchParams }: RouteProps) {
  const filters = (await searchParams) ?? {};
  const [allPages, workspaces, sites, filteredPages, linkOpportunities, schemaOpportunities, draftQueue, duplicateReview] =
    await Promise.all([
      apiFetch<PageRecord[]>("/api/pages"),
      apiFetch<Workspace[]>("/api/workspaces"),
      apiFetch<Site[]>("/api/sites"),
      apiFetch<PageRecord[]>(buildPagesPath(filters).replace("/pages", "/api/pages")),
      apiFetch<LinkOpportunities>("/api/pages/link-opportunities"),
      apiFetch<SchemaOpportunities>("/api/pages/schema-opportunities"),
      apiFetch<DraftQueue>("/api/pages/draft-queue"),
      apiFetch<DuplicateReview>("/api/pages/duplicates"),
    ]);

  const noSites = sites.length === 0;
  const hasFilters = Boolean(
    filters.siteId ||
      filters.lifecycleStatus ||
      filters.hasScan === "true" ||
      filters.hasRecommendations === "true" ||
      filters.freshness,
  );

  const draftCount = allPages.filter((p) => p.lifecycleStatus === "DRAFT_ONLY").length;
  const scannedCount = allPages.filter((p) => p.latestSuccessfulScoreSnapshot !== null).length;
  const withRecsCount = allPages.filter((p) => p._count.recommendations > 0).length;
  const liveCount = allPages.filter((p) => p.existsLive).length;
  const staleCount = allPages.filter((p) => freshnessLabel(p) === "stale").length;
  const neverCount = allPages.filter((p) => freshnessLabel(p) === "never").length;

  const isDraftFilter = filters.lifecycleStatus === "DRAFT_ONLY";

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pages</h1>
        <p className="text-sm text-muted-foreground">
          Review discovered pages, focus the queue, and open the ones that matter.
        </p>
      </div>

      <PageCreateForm sites={sites} workspaces={workspaces} />

      {/* Draft execution queue */}
      {draftQueue.totalDraftPages > 0 ? (
        <DraftExecutionQueue queue={draftQueue} />
      ) : null}

      {/* Duplicate page review */}
      {duplicateReview.duplicateGroupsCount > 0 ? (
        <DuplicatePageReview review={duplicateReview} workspaces={workspaces} />
      ) : null}

      {/* Summary counts */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Pages" value={String(allPages.length)} />
        <SummaryCard label="Live Pages" value={String(liveCount)} />
        <SummaryCard label="Draft Only" value={String(draftCount)} highlight={draftCount > 0} />
        <SummaryCard label="Scanned" value={String(scannedCount)} />
      </section>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Quick filters:</span>
        <Link
          href="/pages"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            !hasFilters
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          All
        </Link>
        <Link
          href="/pages?lifecycleStatus=DRAFT_ONLY"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            isDraftFilter
              ? "border-amber-400 bg-amber-100 text-amber-800"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          Draft only {draftCount > 0 ? `(${draftCount})` : ""}
        </Link>
        <Link
          href="/pages?lifecycleStatus=ACTIVE"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            filters.lifecycleStatus === "ACTIVE"
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          Active
        </Link>
        <Link
          href="/pages?hasScan=true"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            filters.hasScan === "true"
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          Scanned ({scannedCount})
        </Link>
        <Link
          href="/pages?hasRecommendations=true"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            filters.hasRecommendations === "true"
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          With recommendations ({withRecsCount})
        </Link>
        <Link
          href="/pages?freshness=stale"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            filters.freshness === "stale"
              ? "border-amber-400 bg-amber-100 text-amber-800"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          Stale {staleCount > 0 ? `(${staleCount})` : ""}
        </Link>
        <Link
          href="/pages?freshness=never"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            filters.freshness === "never"
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          Never scanned {neverCount > 0 ? `(${neverCount})` : ""}
        </Link>
        <Link
          href="/pages?freshness=fresh"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium transition ${
            filters.freshness === "fresh"
              ? "border-emerald-400 bg-emerald-100 text-emerald-800"
              : "border-border bg-background text-foreground hover:bg-secondary"
          }`}
        >
          Fresh
        </Link>
      </div>

      {/* Advanced filter form */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-4 space-y-1">
          <h2 className="text-base font-semibold tracking-tight">Advanced filters</h2>
        </div>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5" method="get">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Site</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              defaultValue={filters.siteId ?? ""}
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
              defaultValue={filters.lifecycleStatus ?? ""}
              name="lifecycleStatus"
            >
              <option value="">All statuses</option>
              {lifecycleOptions.map((status) => (
                <option key={status} value={status}>
                  {lifecycleLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Scanned</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              defaultValue={filters.hasScan ?? ""}
              name="hasScan"
            >
              <option value="">All</option>
              <option value="true">Scanned only</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Recommendations</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              defaultValue={filters.hasRecommendations ?? ""}
              name="hasRecommendations"
            >
              <option value="">All</option>
              <option value="true">With recommendations</option>
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              type="submit"
            >
              Apply
            </button>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
              href="/pages"
            >
              Reset
            </Link>
          </div>
        </form>
      </section>

      {/* Internal link opportunities */}
      {(linkOpportunities.weaklyLinkedPagesCount > 0 ||
        linkOpportunities.faqLikePagesCount > 0 ||
        linkOpportunities.topLinkCandidatesCount > 0) ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Internal link opportunities</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Derived from scanned page signals. Weakly linked = fewer than{" "}
              {linkOpportunities.thresholds.weakLink} internal links.
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-3">
            <LinkOpportunityList
              title={`Weakly linked (${linkOpportunities.weaklyLinkedPagesCount})`}
              items={linkOpportunities.weaklyLinkedPages}
              empty="No weakly linked pages found."
            />
            <LinkOpportunityList
              title={`Strong candidates (${linkOpportunities.topLinkCandidatesCount})`}
              items={linkOpportunities.topLinkCandidates}
              empty="No strong-content pages with low links found."
              note="Content-rich pages that need more incoming links."
            />
            <LinkOpportunityList
              title={`FAQ pages needing links (${linkOpportunities.faqLikePagesCount})`}
              items={linkOpportunities.faqLikePagesWithoutLinks}
              empty="No FAQ-like pages with few links found."
              note="FAQ sections detected but low internal link count."
            />
          </div>
          {!linkOpportunities.orphanInferenceAvailable ? (
            <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
              Orphan detection requires inbound link graph data — not yet available. Run internal
              crawls to build link graph.
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Structured data opportunities */}
      {(schemaOpportunities.pagesMissingStructuredDataCount > 0 ||
        schemaOpportunities.faqPagesMissingFaqSchemaCount > 0 ||
        schemaOpportunities.authorityPagesMissingAuthoritySchemaCount > 0 ||
        schemaOpportunities.pagesWithCanonicalOrIndexabilityRiskCount > 0) ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Structured data opportunities</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Derived from real scan signals. Affects how crawlers extract and understand page content.
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-4">
            <SchemaOpportunityList
              title={`Missing structured data (${schemaOpportunities.pagesMissingStructuredDataCount})`}
              items={schemaOpportunities.pagesMissingStructuredData}
              empty="All scanned pages have structured data."
            />
            <SchemaOpportunityList
              title={`FAQ missing FAQPage schema (${schemaOpportunities.faqPagesMissingFaqSchemaCount})`}
              items={schemaOpportunities.faqPagesMissingFaqSchema}
              empty="No FAQ pages missing FAQPage schema."
            />
            <SchemaOpportunityList
              title={`Authority pages missing schema (${schemaOpportunities.authorityPagesMissingAuthoritySchemaCount})`}
              items={schemaOpportunities.authorityPagesMissingAuthoritySchema}
              empty="No authority pages missing Person/Org schema."
            />
            <SchemaOpportunityList
              title={`Canonical / indexability risk (${schemaOpportunities.pagesWithCanonicalOrIndexabilityRiskCount})`}
              items={schemaOpportunities.pagesWithCanonicalOrIndexabilityRisk}
              empty="No canonical or indexability risks detected."
            />
          </div>
        </section>
      ) : null}

      {/* Page table */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {hasFilters ? "Filtered pages" : "All pages"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({filteredPages.length})
            </span>
          </h2>
        </div>

        {allPages.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No pages yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {noSites
                ? "Create a site first."
                : "Create your first page or ingest a sitemap."}
            </p>
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-foreground">No pages match these filters</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try widening the filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Title / Path
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Readiness
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Inbound
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Live
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Last Scanned
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Freshness
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Score
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredPages.map((page) => {
                  const isDraft = page.lifecycleStatus === "DRAFT_ONLY";
                  return (
                    <tr
                      key={page.id}
                      className={isDraft ? "bg-amber-50/60" : undefined}
                    >
                      <td className="px-6 py-4">
                        <Link
                          className="font-medium text-foreground transition hover:text-muted-foreground"
                          href={`/pages/${page.id}`}
                        >
                          {page.title?.trim() || "Untitled"}
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {page.path}
                        </p>
                        {(() => {
                          const summary = crawlSummary(page);
                          return summary.orphanLike ? (
                            <span className="mt-2 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                              Orphan-like
                            </span>
                          ) : null;
                        })()}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {page.pageType || "-"}
                      </td>
                      <td className="px-6 py-4">
                        <LifecycleBadge status={page.lifecycleStatus} />
                      </td>
                      <td className="px-6 py-4">
                        <ReadinessChip page={page} />
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {inboundLabel(page)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {page.existsLive ? (
                          <span className="text-emerald-700">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {page.currentLivePageVersionId ? (
                          <span className="text-foreground">Yes</span>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {page.latestSuccessfulScanRun?.completedAt
                          ? formatDate(page.latestSuccessfulScanRun.completedAt)
                          : <span className="text-muted-foreground/60">Never</span>}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const fl = freshnessLabel(page);
                          return fl ? <FreshnessBadge label={fl} /> : <span className="text-xs text-muted-foreground">—</span>;
                        })()}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatScore(page.latestSuccessfulScoreSnapshot?.overallScore)}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatDate(page.updatedAt)}
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

// ─── Duplicate page review ───────────────────────────────────────────────────

function DuplicatePageReview({
  review,
  workspaces,
}: {
  review: DuplicateReview;
  workspaces: Workspace[];
}) {
  // Pick a workspaceId for the reconcile call — use the first workspace available
  const workspaceId = workspaces[0]?.id ?? "";

  return (
    <section className="overflow-hidden rounded-2xl border border-rose-200 bg-card shadow-soft">
      <div className="border-b border-rose-200 bg-rose-50/60 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Duplicate page review</h2>
            <p className="text-sm text-muted-foreground">
              Pages sharing the same canonical URL or path within a site.{" "}
              <span className="font-medium text-foreground">
                {review.duplicateGroupsCount} group{review.duplicateGroupsCount !== 1 ? "s" : ""}
              </span>
              {", "}
              <span className="font-medium text-foreground">
                {review.duplicatePagesCount} page{review.duplicatePagesCount !== 1 ? "s" : ""}
              </span>{" "}
              affected. Archiving duplicates will not delete any data.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {review.groups.map((group) => {
          const primary = group.pages.find((p) => p.id === group.suggestedPrimaryPageId);
          const duplicates = group.pages.filter((p) => p.id !== group.suggestedPrimaryPageId);
          const duplicateIds = duplicates.map((p) => p.id);

          return (
            <div key={group.groupKey} className="px-6 py-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                  {group.pageCount} duplicates
                </span>
                <span className="font-mono text-xs text-muted-foreground">{group.groupKey.split("::").slice(2).join("::")}</span>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.pages.map((page) => {
                  const isPrimary = page.id === group.suggestedPrimaryPageId;
                  return (
                    <div
                      key={page.id}
                      className={`rounded-xl border p-3 ${
                        isPrimary
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-border bg-secondary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/pages/${page.id}`}
                          className="truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {page.title?.trim() || "Untitled"}
                        </Link>
                        {isPrimary ? (
                          <span className="shrink-0 inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Primary
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600">
                            Duplicate
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{page.path}</span>
                        <span>{page.lifecycleStatus}</span>
                        {page.existsLive ? (
                          <span className="text-emerald-700">Live</span>
                        ) : null}
                        {page.latestOverallScore !== null ? (
                          <span>Score {page.latestOverallScore.toFixed(2)}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {workspaceId && duplicateIds.length > 0 ? (
                <ReconcileDuplicatesForm
                  workspaceId={workspaceId}
                  primaryPageId={group.suggestedPrimaryPageId}
                  duplicatePageIds={duplicateIds}
                  primaryPath={primary?.path ?? group.suggestedPrimaryPageId}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Draft execution queue ────────────────────────────────────────────────────

const QUEUE_BUCKETS: Array<{
  key: keyof Pick<
    DraftQueue,
    | "draftOnlyPages"
    | "draftReadyToApply"
    | "pagesNeedingVerify"
    | "pagesNeedingScan"
    | "pagesNeedingReconcile"
  >;
  countKey: keyof Pick<
    DraftQueue,
    | "draftOnlyPagesCount"
    | "pagesWithDraftReadyToApplyCount"
    | "pagesNeedingVerifyCount"
    | "pagesNeedingScanCount"
    | "pagesNeedingReconcileCount"
  >;
  label: string;
  hint: string;
  color: string;
}> = [
  {
    key: "draftOnlyPages",
    countKey: "draftOnlyPagesCount",
    label: "Draft only",
    hint: "No live version yet. Create a draft and apply it.",
    color: "border-amber-300 bg-amber-50 text-amber-800",
  },
  {
    key: "draftReadyToApply",
    countKey: "pagesWithDraftReadyToApplyCount",
    label: "Ready to apply",
    hint: "A draft exists that differs from the live version.",
    color: "border-blue-300 bg-blue-50 text-blue-800",
  },
  {
    key: "pagesNeedingVerify",
    countKey: "pagesNeedingVerifyCount",
    label: "Needs verify",
    hint: "Live version exists but route not verified.",
    color: "border-orange-300 bg-orange-50 text-orange-800",
  },
  {
    key: "pagesNeedingScan",
    countKey: "pagesNeedingScanCount",
    label: "Needs scan",
    hint: "Verified live page has never been scanned.",
    color: "border-purple-300 bg-purple-50 text-purple-800",
  },
  {
    key: "pagesNeedingReconcile",
    countKey: "pagesNeedingReconcileCount",
    label: "Needs reconcile",
    hint: "Scanned but no active recommendation batch matching the latest scan.",
    color: "border-rose-300 bg-rose-50 text-rose-800",
  },
];

function DraftQueuePageItem({ item }: { item: DraftQueueItem }) {
  return (
    <div className="px-4 py-3">
      <Link
        href={`/pages/${item.id}`}
        className="text-sm font-medium text-foreground hover:underline"
      >
        {item.title?.trim() || "Untitled"}
      </Link>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{item.path}</span>
        {item.latestOverallScore !== null ? (
          <span>Score {item.latestOverallScore.toFixed(2)}</span>
        ) : null}
        {item.activeRecommendationCount > 0 ? (
          <span>{item.activeRecommendationCount} open rec{item.activeRecommendationCount !== 1 ? "s" : ""}</span>
        ) : null}
      </div>
    </div>
  );
}

function DraftExecutionQueue({ queue }: { queue: DraftQueue }) {
  const hasAny = queue.totalDraftPages > 0;
  if (!hasAny) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Draft execution queue</h2>
            <p className="text-sm text-muted-foreground">
              Pages with pending workflow actions derived from real DB state.{" "}
              <span className="font-medium text-foreground">{queue.totalDraftPages}</span> page
              {queue.totalDraftPages !== 1 ? "s" : ""} need attention.
            </p>
          </div>
          <Link
            href="/pages?lifecycleStatus=DRAFT_ONLY"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            View draft-only →
          </Link>
        </div>

        {/* Count strip */}
        <div className="mt-4 flex flex-wrap gap-2">
          {QUEUE_BUCKETS.map((bucket) => {
            const count = queue[bucket.countKey];
            if (count === 0) return null;
            return (
              <span
                key={bucket.key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${bucket.color}`}
              >
                <span className="font-semibold">{count}</span>
                {bucket.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Per-bucket lists */}
      <div className="grid gap-px bg-border xl:grid-cols-5">
        {QUEUE_BUCKETS.map((bucket) => {
          const items = queue[bucket.key];
          const count = queue[bucket.countKey];
          return (
            <section key={bucket.key} className="bg-card">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold tracking-tight">
                  {bucket.label}
                  {count > 0 ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">({count})</span>
                  ) : null}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{bucket.hint}</p>
              </div>
              {items.length === 0 ? (
                <div className="px-4 py-5 text-xs text-muted-foreground">None pending.</div>
              ) : (
                <div className="divide-y divide-border">
                  {items.slice(0, 8).map((item) => (
                    <DraftQueuePageItem key={item.id} item={item} />
                  ))}
                  {items.length > 8 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground">
                      +{items.length - 8} more — use filters to see all.
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function SchemaOpportunityList({
  title,
  items,
  empty,
}: {
  title: string;
  items: SchemaOpportunityItem[];
  empty: string;
}) {
  return (
    <section className="bg-card">
      <div className="border-b border-border px-6 py-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-6 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="px-6 py-3">
              <Link
                href={`/pages/${item.id}`}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {item.title?.trim() || item.path}
              </Link>
              <div className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                {item.gaps[0] ? (
                  <p className="mt-0.5 text-xs text-muted-foreground/80 line-clamp-1">
                    {item.gaps[0]}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LinkOpportunityList({
  title,
  items,
  empty,
  note,
}: {
  title: string;
  items: LinkOpportunityItem[];
  empty: string;
  note?: string;
}) {
  return (
    <section className="bg-card">
      <div className="border-b border-border px-6 py-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-6 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="px-6 py-3">
              <Link
                href={`/pages/${item.id}`}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {item.title?.trim() || item.path}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                <span>
                  {item.internalLinkCount !== null
                    ? `${item.internalLinkCount} internal links`
                    : "links unknown"}
                </span>
                {item.discoveredFromCount > 0 ? (
                  <span>{item.discoveredFromCount} inbound source{item.discoveredFromCount === 1 ? "" : "s"}</span>
                ) : item.orphanLike ? (
                  <span>Orphan-like</span>
                ) : null}
                {item.latestOverallScore !== null ? (
                  <span>Score {item.latestOverallScore.toFixed(2)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-soft ${
        highlight ? "border-amber-300 bg-amber-50" : "border-border bg-card"
      }`}
    >
      <p className={`text-sm ${highlight ? "text-amber-700" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`mt-3 text-3xl font-semibold tracking-tight ${
          highlight ? "text-amber-800" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </section>
  );
}
