import Link from "next/link";

import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type DashboardOverview = {
  workspaceCount: number;
  siteCount: number;
  pageCount: number;
  livePageCount: number;
  draftOnlyPageCount: number;
  recommendationCount: number;
  openTaskCount: number;
  completedScanCount: number;
};

type ContentRiskItem = {
  id: string;
  title: string | null;
  path: string;
  textLength: number | null;
  headingCount: number | null;
  h1Count: number | null;
  hasAuthorSignal: boolean | null;
  hasDateSignal: boolean | null;
  answerClarityScore: number | null;
  extractabilityScore: number | null;
  gaps: string[];
};

type DashboardContentOpportunities = {
  pagesMissingDirectAnswerCount: number;
  pagesWithWeakHeadingStructureCount: number;
  pagesMissingEvidenceSignalsCount: number;
  pagesNeedingFaqSectionCount: number;
  pagesMissingDirectAnswer: ContentRiskItem[];
  pagesWithWeakHeadingStructure: ContentRiskItem[];
  pagesMissingEvidenceSignals: ContentRiskItem[];
  pagesNeedingFaqSection: ContentRiskItem[];
};

type SchemaRiskItem = {
  id: string;
  title: string | null;
  path: string;
  structuredDataPresent: boolean | null;
  schemaHints: string[];
  gaps: string[];
};

type DashboardSchemaOpportunities = {
  pagesMissingStructuredDataCount: number;
  faqPagesMissingFaqSchemaCount: number;
  authorityPagesMissingAuthoritySchemaCount: number;
  pagesWithCanonicalOrIndexabilityRiskCount: number;
  pagesMissingStructuredData: SchemaRiskItem[];
  faqPagesMissingFaqSchema: SchemaRiskItem[];
  authorityPagesMissingAuthoritySchema: SchemaRiskItem[];
  pagesWithCanonicalOrIndexabilityRisk: SchemaRiskItem[];
};

type CoverageRiskItem = {
  id: string;
  title: string | null;
  path: string;
  indexabilityHint: string | null;
  canonicalMatchesUrl: boolean | null;
  discoveredFromCount: number | null;
  latestSuccessfulScanAt: string | null;
};

type DashboardCoverageRisks = {
  orphanLikePagesCount: number;
  noindexPagesCount: number;
  canonicalMismatchPagesCount: number;
  neverScannedPagesCount: number;
  orphanInferenceAvailable: boolean;
  orphanLikePages: CoverageRiskItem[];
  noindexPages: CoverageRiskItem[];
  canonicalMismatchPages: CoverageRiskItem[];
  neverScannedPages: CoverageRiskItem[];
};

type LinkOpportunityItem = {
  id: string;
  title: string | null;
  path: string;
  internalLinkCount: number | null;
  latestOverallScore: number | null;
};

type DashboardLinkOpportunities = {
  orphanInferenceAvailable: boolean;
  weaklyLinkedPagesCount: number;
  faqLikePagesCount: number;
  topLinkCandidatesCount: number;
  weaklyLinkedPages: LinkOpportunityItem[];
  topLinkCandidates: LinkOpportunityItem[];
  faqLikePagesWithoutLinks: LinkOpportunityItem[];
};

type FreshnessPageItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: string;
  latestSuccessfulScanAt: string | null;
  latestOverallScore: number | null;
};

type DashboardFreshness = {
  stalePagesCount: number;
  recentlyScannedPagesCount: number;
  neverScannedPagesCount: number;
  stalePages: FreshnessPageItem[];
  recentlyScannedPages: FreshnessPageItem[];
  neverScannedPages: FreshnessPageItem[];
};

type DashboardTrends = {
  totalSnapshots: number;
  averageOverallScore: number | null;
  improvedPagesCount: number;
  declinedPagesCount: number;
  unchangedPagesCount: number;
  recentlyScannedPagesCount: number;
  latestSnapshots: Array<{
    pageId: string;
    pageTitle: string | null;
    overallScore: string | number | null;
    blockersCount: number;
    createdAt: string;
  }>;
  topImprovedPages: Array<{
    pageId: string;
    pageTitle: string | null;
    beforeScore: string | number | null;
    afterScore: string | number | null;
    delta: number;
    createdAt: string;
  }>;
};

type PriorityItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: string;
  latestOverallScore: number | null;
  blockersCount: number;
};

type ImprovedPriorityItem = PriorityItem & {
  delta: number;
};

type DashboardPriorities = {
  weakPages: PriorityItem[];
  unscannedPages: PriorityItem[];
  pagesWithBlockers: PriorityItem[];
  pagesNeedingRecommendations: PriorityItem[];
  recentlyImprovedPages: ImprovedPriorityItem[];
};

type RecommendationCoverage = {
  scannedPagesCount: number;
  pagesWithActiveRecommendationsCount: number;
  pagesNeedingRecommendationsCount: number;
  pagesWithoutSuccessfulScanCount: number;
};

type DraftWorkflow = {
  totalDraftPages: number;
  draftOnlyPagesCount: number;
  pagesWithDraftReadyToApplyCount: number;
  pagesNeedingVerifyCount: number;
  pagesNeedingScanCount: number;
  pagesNeedingReconcileCount: number;
};

type RegistryTruth = {
  duplicateGroupsCount: number;
  duplicatePagesCount: number;
};

const overviewCards: Array<{ key: keyof DashboardOverview; label: string }> = [
  { key: "siteCount", label: "Sites" },
  { key: "pageCount", label: "Pages" },
  { key: "livePageCount", label: "Live Pages" },
  { key: "completedScanCount", label: "Completed Scans" },
  { key: "recommendationCount", label: "Recommendations" },
  { key: "openTaskCount", label: "Open Tasks" },
];

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

function isEarlyState(o: DashboardOverview) {
  return o.completedScanCount === 0;
}

type SetupStep = {
  label: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
};

function getSetupSteps(o: DashboardOverview): SetupStep[] {
  return [
    {
      label: "Add a site",
      description: "Connect a domain so GEO OS knows what to track.",
      href: "/sites",
      action: "Go to Sites →",
      done: o.siteCount > 0,
    },
    {
      label: "Import pages from your sitemap",
      description: "Pull in your URLs so each page can be tracked and scored.",
      href: "/sites",
      action: "Ingest pages →",
      done: o.pageCount > 0,
    },
    {
      label: "Run your first scan",
      description: "Open a page and run a scan to create your first score and findings.",
      href: "/pages",
      action: "Open pages →",
      done: o.completedScanCount > 0,
    },
  ];
}

export default async function DashboardPage() {
  const [overview, trends, priorities, freshness, linkOpportunities, coverageRisks, schemaOpportunities, contentOpportunities, recommendationCoverage, draftWorkflow, registryTruth] =
    await Promise.all([
      apiFetch<DashboardOverview>("/api/dashboard/overview"),
      apiFetch<DashboardTrends>("/api/dashboard/trends"),
      apiFetch<DashboardPriorities>("/api/dashboard/priorities"),
      apiFetch<DashboardFreshness>("/api/dashboard/freshness"),
      apiFetch<DashboardLinkOpportunities>("/api/pages/link-opportunities"),
      apiFetch<DashboardCoverageRisks>("/api/dashboard/coverage-risks"),
      apiFetch<DashboardSchemaOpportunities>("/api/pages/schema-opportunities"),
      apiFetch<DashboardContentOpportunities>("/api/pages/content-opportunities"),
      apiFetch<RecommendationCoverage>("/api/recommendations/coverage"),
      apiFetch<DraftWorkflow>("/api/pages/draft-queue"),
      apiFetch<RegistryTruth>("/api/pages/duplicates"),
    ]);

  const earlyState = isEarlyState(overview);
  const setupSteps = getSetupSteps(overview);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Operational overview from live GEO OS data.</p>
      </div>

      {earlyState ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Getting started</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Complete these steps to activate your GEO OS workflow.
            </p>
          </div>
          <div className="divide-y divide-border">
            {setupSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-4 px-6 py-5">
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    step.done
                      ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                      : "border-border bg-secondary text-muted-foreground"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={`text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {step.label}
                  </p>
                  {!step.done && (
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  )}
                </div>
                {!step.done && (
                  <Link
                    className="shrink-0 inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-secondary"
                    href={step.href}
                  >
                    {step.action}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {overviewCards.map((card) => (
          <section
            key={card.key}
            className="rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {overview[card.key]}
            </p>
          </section>
        ))}
      </div>

      {!earlyState ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Recommendation coverage</h2>
              <p className="text-sm text-muted-foreground">
                Scanned pages that still need an active recommendation batch.
              </p>
            </div>
            <Link
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              href="/recommendations"
            >
              Open recommendations →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Scanned pages" value={String(recommendationCoverage.scannedPagesCount)} />
            <MetricCard
              label="Active coverage"
              value={String(recommendationCoverage.pagesWithActiveRecommendationsCount)}
            />
            <MetricCard
              label="Need recommendations"
              value={String(recommendationCoverage.pagesNeedingRecommendationsCount)}
            />
            <MetricCard
              label="Without successful scan"
              value={String(recommendationCoverage.pagesWithoutSuccessfulScanCount)}
            />
          </div>
        </section>
      ) : null}

      {!earlyState && draftWorkflow.totalDraftPages > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Draft workflow</h2>
              <p className="text-sm text-muted-foreground">
                Pages with pending publish-readiness actions.{" "}
                <span className="font-medium text-foreground">
                  {draftWorkflow.totalDraftPages}
                </span>{" "}
                page{draftWorkflow.totalDraftPages !== 1 ? "s" : ""} in queue.
              </p>
            </div>
            <Link
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              href="/pages"
            >
              Open pages →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {draftWorkflow.draftOnlyPagesCount > 0 ? (
              <WorkflowBucket
                label="Draft only"
                count={draftWorkflow.draftOnlyPagesCount}
                color="amber"
                href="/pages?lifecycleStatus=DRAFT_ONLY"
              />
            ) : null}
            {draftWorkflow.pagesWithDraftReadyToApplyCount > 0 ? (
              <WorkflowBucket
                label="Ready to apply"
                count={draftWorkflow.pagesWithDraftReadyToApplyCount}
                color="blue"
                href="/pages"
              />
            ) : null}
            {draftWorkflow.pagesNeedingVerifyCount > 0 ? (
              <WorkflowBucket
                label="Needs verify"
                count={draftWorkflow.pagesNeedingVerifyCount}
                color="orange"
                href="/pages"
              />
            ) : null}
            {draftWorkflow.pagesNeedingScanCount > 0 ? (
              <WorkflowBucket
                label="Needs scan"
                count={draftWorkflow.pagesNeedingScanCount}
                color="purple"
                href="/pages"
              />
            ) : null}
            {draftWorkflow.pagesNeedingReconcileCount > 0 ? (
              <WorkflowBucket
                label="Needs reconcile"
                count={draftWorkflow.pagesNeedingReconcileCount}
                color="rose"
                href="/pages"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {!earlyState && registryTruth.duplicateGroupsCount > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-card p-6 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Registry truth risks</h2>
              <p className="text-sm text-muted-foreground">
                Duplicate pages detected in the registry.{" "}
                <span className="font-medium text-foreground">
                  {registryTruth.duplicateGroupsCount} group{registryTruth.duplicateGroupsCount !== 1 ? "s" : ""}
                </span>
                {", "}
                <span className="font-medium text-foreground">
                  {registryTruth.duplicatePagesCount} page{registryTruth.duplicatePagesCount !== 1 ? "s" : ""}
                </span>{" "}
                affected.
              </p>
            </div>
            <Link
              className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              href="/pages"
            >
              Review duplicates →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <WorkflowBucket
              label="Duplicate groups"
              count={registryTruth.duplicateGroupsCount}
              color="rose"
              href="/pages"
            />
            <WorkflowBucket
              label="Affected pages"
              count={registryTruth.duplicatePagesCount}
              color="amber"
              href="/pages"
            />
          </div>
        </section>
      ) : null}

      {!earlyState ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Average Score" value={formatScore(trends.averageOverallScore)} />
          <MetricCard label="Improved Pages" value={String(trends.improvedPagesCount)} />
          <MetricCard label="Declined Pages" value={String(trends.declinedPagesCount)} />
          <MetricCard label="Unchanged Pages" value={String(trends.unchangedPagesCount)} />
          <MetricCard label="Recently Scanned" value={String(trends.recentlyScannedPagesCount)} />
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">What to do next</h2>
          <p className="mt-1 text-sm text-muted-foreground">Priority buckets from real scan and recommendation state.</p>
        </div>
        <div className="grid gap-px bg-border xl:grid-cols-2">
          <PriorityList title="Weak pages" items={priorities.weakPages} empty="No weak pages right now." />
          <PriorityList title="Unscanned pages" items={priorities.unscannedPages} empty="No unscanned pages with a live version." />
          <PriorityList title="Pages with blockers" items={priorities.pagesWithBlockers} empty="No blocker-heavy pages right now." />
          <PriorityList title="Pages needing recommendations" items={priorities.pagesNeedingRecommendations} empty="All scanned pages already have an active recommendation batch." />
          <PriorityList title="Recently improved pages" items={priorities.recentlyImprovedPages} empty="No measured improvements yet." showDelta />
        </div>
      </section>

      {!earlyState ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Freshness and Re-audit</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages with a live version, grouped by scan age. Stale = no scan or scan older than 14 days.
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-3">
            <FreshnessList
              title={`Stale (${freshness.stalePagesCount})`}
              items={freshness.stalePages}
              empty="No stale pages."
              badge="stale"
            />
            <FreshnessList
              title={`Never scanned (${freshness.neverScannedPagesCount})`}
              items={freshness.neverScannedPages}
              empty="All live pages have been scanned."
              badge="never"
            />
            <FreshnessList
              title={`Recently scanned (${freshness.recentlyScannedPagesCount})`}
              items={freshness.recentlyScannedPages}
              empty="No pages scanned in the last 7 days."
              badge="fresh"
            />
          </div>
        </section>
      ) : null}

      {!earlyState &&
      (linkOpportunities.weaklyLinkedPagesCount > 0 ||
        linkOpportunities.topLinkCandidatesCount > 0) ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Internal linking</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages with low internal link counts derived from scan signals.{" "}
              <Link href="/pages" className="underline">
                View all →
              </Link>
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-3">
            <DashboardLinkList
              title={`Weakly linked (${linkOpportunities.weaklyLinkedPagesCount})`}
              items={linkOpportunities.weaklyLinkedPages}
              empty="None found."
            />
            <DashboardLinkList
              title={`Strong candidates (${linkOpportunities.topLinkCandidatesCount})`}
              items={linkOpportunities.topLinkCandidates}
              empty="None found."
            />
            <DashboardLinkList
              title={`FAQ pages (${linkOpportunities.faqLikePagesCount})`}
              items={linkOpportunities.faqLikePagesWithoutLinks}
              empty="None found."
            />
          </div>
          {!linkOpportunities.orphanInferenceAvailable ? (
            <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
              Orphan detection not yet available — run internal crawls to build a link graph.
            </div>
          ) : null}
        </section>
      ) : null}

      {!earlyState &&
      (coverageRisks.orphanLikePagesCount > 0 ||
        coverageRisks.noindexPagesCount > 0 ||
        coverageRisks.canonicalMismatchPagesCount > 0 ||
        coverageRisks.neverScannedPagesCount > 0) ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Site coverage risks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages with indexability, canonicalization, or discovery issues.{" "}
              <Link href="/sites" className="underline">
                View sites →
              </Link>
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-4">
            <CoverageRiskList
              title={`Never scanned (${coverageRisks.neverScannedPagesCount})`}
              items={coverageRisks.neverScannedPages}
              empty="All live pages have been scanned."
            />
            <CoverageRiskList
              title={`Noindex (${coverageRisks.noindexPagesCount})`}
              items={coverageRisks.noindexPages}
              empty="No noindex pages detected."
            />
            <CoverageRiskList
              title={`Canonical mismatch (${coverageRisks.canonicalMismatchPagesCount})`}
              items={coverageRisks.canonicalMismatchPages}
              empty="No canonical mismatches detected."
            />
            <CoverageRiskList
              title={
                coverageRisks.orphanInferenceAvailable
                  ? `Orphan-like (${coverageRisks.orphanLikePagesCount})`
                  : "Orphan-like (no data)"
              }
              items={coverageRisks.orphanLikePages}
              empty={
                coverageRisks.orphanInferenceAvailable
                  ? "No orphan-like pages found."
                  : "Run a crawl to detect orphans."
              }
            />
          </div>
        </section>
      ) : null}

      {!earlyState &&
      (schemaOpportunities.pagesMissingStructuredDataCount > 0 ||
        schemaOpportunities.faqPagesMissingFaqSchemaCount > 0 ||
        schemaOpportunities.authorityPagesMissingAuthoritySchemaCount > 0 ||
        schemaOpportunities.pagesWithCanonicalOrIndexabilityRiskCount > 0) ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Structured data risks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages with missing, incomplete, or conflicting schema markup.{" "}
              <Link href="/pages" className="underline">
                View all →
              </Link>
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-4">
            <SchemaRiskList
              title={`Missing structured data (${schemaOpportunities.pagesMissingStructuredDataCount})`}
              items={schemaOpportunities.pagesMissingStructuredData}
              empty="No pages missing structured data."
            />
            <SchemaRiskList
              title={`FAQ schema gap (${schemaOpportunities.faqPagesMissingFaqSchemaCount})`}
              items={schemaOpportunities.faqPagesMissingFaqSchema}
              empty="No FAQ schema gaps found."
            />
            <SchemaRiskList
              title={`Authority schema gap (${schemaOpportunities.authorityPagesMissingAuthoritySchemaCount})`}
              items={schemaOpportunities.authorityPagesMissingAuthoritySchema}
              empty="No authority schema gaps found."
            />
            <SchemaRiskList
              title={`Canonical / indexability risk (${schemaOpportunities.pagesWithCanonicalOrIndexabilityRiskCount})`}
              items={schemaOpportunities.pagesWithCanonicalOrIndexabilityRisk}
              empty="No canonical or indexability risks."
            />
          </div>
        </section>
      ) : null}

      {!earlyState &&
      (contentOpportunities.pagesMissingDirectAnswerCount > 0 ||
        contentOpportunities.pagesWithWeakHeadingStructureCount > 0 ||
        contentOpportunities.pagesMissingEvidenceSignalsCount > 0 ||
        contentOpportunities.pagesNeedingFaqSectionCount > 0) ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Content structure risks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pages with answer-readiness, heading, evidence, or extractability gaps.{" "}
              <Link href="/pages" className="underline">
                View all →
              </Link>
            </p>
          </div>
          <div className="grid gap-px bg-border xl:grid-cols-4">
            <ContentRiskList
              title={`Missing direct answer (${contentOpportunities.pagesMissingDirectAnswerCount})`}
              items={contentOpportunities.pagesMissingDirectAnswer}
              empty="No pages with this gap."
            />
            <ContentRiskList
              title={`Weak headings (${contentOpportunities.pagesWithWeakHeadingStructureCount})`}
              items={contentOpportunities.pagesWithWeakHeadingStructure}
              empty="All pages have sufficient heading structure."
            />
            <ContentRiskList
              title={`Needs FAQ (${contentOpportunities.pagesNeedingFaqSectionCount})`}
              items={contentOpportunities.pagesNeedingFaqSection}
              empty="No FAQ opportunities found."
            />
            <ContentRiskList
              title={`Missing evidence (${contentOpportunities.pagesMissingEvidenceSignalsCount})`}
              items={contentOpportunities.pagesMissingEvidenceSignals}
              empty="All pages have author or date signals."
            />
          </div>
        </section>
      ) : null}

      {!earlyState ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">Latest Snapshots</h2>
            </div>
            {trends.latestSnapshots.length === 0 ? (
              <EmptyState title="No score snapshots yet" body="Run a scan to create the first measurement baseline." />
            ) : (
              <div className="divide-y divide-border">
                {trends.latestSnapshots.map((snapshot) => (
                  <div key={`${snapshot.pageId}-${snapshot.createdAt}`} className="px-6 py-4">
                    <Link href={`/pages/${snapshot.pageId}`} className="text-sm font-medium text-foreground hover:underline">
                      {snapshot.pageTitle?.trim() || snapshot.pageId}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Score {formatScore(snapshot.overallScore)}</span>
                      <span>Blockers {snapshot.blockersCount}</span>
                      <span>{formatDate(snapshot.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold tracking-tight">Top Improved Pages</h2>
            </div>
            {trends.topImprovedPages.length === 0 ? (
              <EmptyState title="No improvements recorded yet" body="Rescan a page after making changes to measure improvement." />
            ) : (
              <div className="divide-y divide-border">
                {trends.topImprovedPages.map((page) => (
                  <div key={`${page.pageId}-${page.createdAt}`} className="px-6 py-4">
                    <Link href={`/pages/${page.pageId}`} className="text-sm font-medium text-foreground hover:underline">
                      {page.pageTitle?.trim() || page.pageId}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatScore(page.beforeScore)} → {formatScore(page.afterScore)}</span>
                      <span>+{page.delta.toFixed(2)}</span>
                      <span>{formatDate(page.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : null}
    </div>
  );
}

function WorkflowBucket({
  label,
  count,
  color,
  href,
}: {
  label: string;
  count: number;
  color: "amber" | "blue" | "orange" | "purple" | "rose";
  href: string;
}) {
  const styles: Record<typeof color, string> = {
    amber: "border-amber-200 bg-amber-50",
    blue: "border-blue-200 bg-blue-50",
    orange: "border-orange-200 bg-orange-50",
    purple: "border-purple-200 bg-purple-50",
    rose: "border-rose-200 bg-rose-50",
  };
  const textStyles: Record<typeof color, string> = {
    amber: "text-amber-800",
    blue: "text-blue-800",
    orange: "text-orange-800",
    purple: "text-purple-800",
    rose: "text-rose-800",
  };
  return (
    <Link
      href={href}
      className={`rounded-2xl border p-4 transition hover:opacity-80 ${styles[color]}`}
    >
      <p className={`text-2xl font-semibold tracking-tight ${textStyles[color]}`}>{count}</p>
      <p className={`mt-1 text-xs font-medium ${textStyles[color]}`}>{label}</p>
    </Link>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function CoverageRiskList({
  title,
  items,
  empty,
}: {
  title: string;
  items: CoverageRiskItem[];
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
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                {item.indexabilityHint === "noindex" ? (
                  <span className="text-red-600">noindex</span>
                ) : null}
                {item.canonicalMatchesUrl === false ? (
                  <span className="text-orange-600">canonical mismatch</span>
                ) : null}
                {item.discoveredFromCount === 0 ? (
                  <span className="text-orange-600">no inbound links</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardLinkList({
  title,
  items,
  empty,
}: {
  title: string;
  items: LinkOpportunityItem[];
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
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {item.internalLinkCount !== null
                    ? `${item.internalLinkCount} internal links`
                    : "links unknown"}
                </span>
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

function FreshnessBadge({ badge }: { badge: "stale" | "never" | "fresh" }) {
  if (badge === "fresh")
    return (
      <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Fresh
      </span>
    );
  if (badge === "stale")
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        Stale
      </span>
    );
  return (
    <span className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Never scanned
    </span>
  );
}

function FreshnessList({
  title,
  items,
  empty,
  badge,
}: {
  title: string;
  items: FreshnessPageItem[];
  empty: string;
  badge: "stale" | "never" | "fresh";
}) {
  return (
    <section className="bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-8 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/pages/${item.id}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {item.title?.trim() || item.path}
                </Link>
                <FreshnessBadge badge={badge} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                {item.latestSuccessfulScanAt ? (
                  <span>Scanned {formatDate(item.latestSuccessfulScanAt)}</span>
                ) : (
                  <span>Not yet scanned</span>
                )}
                {item.latestOverallScore != null ? (
                  <span>Score {formatScore(item.latestOverallScore)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ContentRiskList({
  title,
  items,
  empty,
}: {
  title: string;
  items: ContentRiskItem[];
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
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                {item.textLength !== null ? (
                  <span>{item.textLength.toLocaleString()} chars</span>
                ) : null}
                {item.h1Count === 0 ? (
                  <span className="text-red-600">no H1</span>
                ) : item.headingCount !== null && item.headingCount < 2 ? (
                  <span className="text-amber-600">{item.headingCount} heading</span>
                ) : null}
                {item.hasAuthorSignal === false && item.hasDateSignal === false ? (
                  <span className="text-amber-600">no evidence</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SchemaRiskList({
  title,
  items,
  empty,
}: {
  title: string;
  items: SchemaRiskItem[];
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
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                {item.structuredDataPresent === false ? (
                  <span className="text-red-600">no schema</span>
                ) : item.schemaHints.length > 0 ? (
                  <span className="text-amber-600">{item.schemaHints.slice(0, 2).join(", ")}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PriorityList({
  title,
  items,
  empty,
  showDelta = false,
}: {
  title: string;
  items: Array<PriorityItem | ImprovedPriorityItem>;
  empty: string;
  showDelta?: boolean;
}) {
  return (
    <section className="bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-8 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="px-6 py-4">
              <Link href={`/pages/${item.id}`} className="text-sm font-medium text-foreground hover:underline">
                {item.title?.trim() || item.path}
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{item.path}</span>
                <span>Score {formatScore(item.latestOverallScore)}</span>
                <span>Blockers {item.blockersCount}</span>
                {showDelta && "delta" in item ? <span>Delta +{item.delta.toFixed(2)}</span> : null}
                <span>{item.existsLive ? "Live" : "Not live"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
