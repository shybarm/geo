import Link from "next/link";
import { notFound } from "next/navigation";

import { PageDetailActions } from "@/components/forms/page-detail-actions";
import { PageEntitySignalForm } from "@/components/forms/page-entity-signal-form";
import { apiFetch } from "@/lib/api-client";
import { parseCrawlSourceSummary } from "@/lib/crawl-source";
import { GenerateDraftForm } from "@/components/forms/generate-draft-form";

type VersionRecord = {
  id: string;
  title: string | null;
  metaDescription: string | null;
  createdAt: string;
  createdBy: string | null;
  contentState: string;
  contentSource: string;
  contentHash: string | null;
  extractedJson: unknown;
};

type RecommendationBatch = {
  id: string;
  pageVersionId: string | null;
  scanRunId: string | null;
  status: string;
  createdAt: string;
};

type PageDetail = {
  id: string;
  workspaceId: string;
  title: string | null;
  path: string;
  pageType: string | null;
  lifecycleStatus: string;
  existsLive: boolean;
  routeLastVerifiedAt: string | null;
  updatedAt: string;
  currentLivePageVersionId: string | null;
  currentLivePageVersion: {
    id: string;
    title: string | null;
    metaDescription: string | null;
    extractedJson: unknown;
  } | null;
  versions: VersionRecord[];
  recommendationBatches: RecommendationBatch[];
  latestSuccessfulScanRun: {
    id: string;
    status: string;
    triggerType: string;
    completedAt: string | null;
    findings: Array<{
      id: string;
      code: string;
      title: string;
      severity: number;
      explanation: string | null;
      findingType: string;
      evidenceJson: unknown;
    }>;
  } | null;
  latestSuccessfulScoreSnapshot: {
    overallScore: string | number | null;
    answerClarityScore: string | number | null;
    topicalSpecificityScore: string | number | null;
    authorityTrustScore: string | number | null;
    expertVisibilityScore: string | number | null;
    extractabilityScore: string | number | null;
    internalLinkingScore: string | number | null;
    snippetUniquenessScore: string | number | null;
    conversionClarityScore: string | number | null;
    entityConsistencyScore: string | number | null;
    updateReadinessScore: string | number | null;
    blockersCount: number;
    reasonCodesJson: string[] | null;
  } | null;
};

type Recommendation = {
  id: string;
  type: string;
  status: string;
  resolutionState: string;
  title: string;
  description: string | null;
  whyItMatters: string | null;
  createdAt: string;
};

type EntityRecord = {
  id: string;
  name: string;
  entityType: string;
};

type EntitySignalRecord = {
  id: string;
  signalType: string;
  visibilityScore: string | number | null;
  createdAt: string;
  entity: {
    id: string;
    name: string;
  };
};

type ScoreHistoryRecord = {
  id: string;
  overallScore: string | number | null;
  answerClarityScore: string | number | null;
  topicalSpecificityScore: string | number | null;
  authorityTrustScore: string | number | null;
  expertVisibilityScore: string | number | null;
  extractabilityScore: string | number | null;
  internalLinkingScore: string | number | null;
  snippetUniquenessScore: string | number | null;
  conversionClarityScore: string | number | null;
  entityConsistencyScore: string | number | null;
  updateReadinessScore: string | number | null;
  blockersCount: number;
  confidence: string | number | null;
  createdAt: string;
  delta: number | null;
};

type ChangeLogRecord = {
  id: string;
  objectType: string;
  objectId: string;
  actionType: string;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
};

type RouteProps = {
  params: Promise<{ pageId: string }>;
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

function formatScore(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return typeof value === "number" ? value.toFixed(2) : value;
}

const scoreFields: Array<{
  key: keyof NonNullable<PageDetail["latestSuccessfulScoreSnapshot"]>;
  label: string;
}> = [
  { key: "answerClarityScore", label: "Answer Clarity" },
  { key: "topicalSpecificityScore", label: "Topical Specificity" },
  { key: "authorityTrustScore", label: "Authority Trust" },
  { key: "expertVisibilityScore", label: "Expert Visibility" },
  { key: "extractabilityScore", label: "Extractability" },
  { key: "internalLinkingScore", label: "Internal Linking" },
  { key: "snippetUniquenessScore", label: "Snippet Uniqueness" },
  { key: "conversionClarityScore", label: "Conversion Clarity" },
  { key: "entityConsistencyScore", label: "Entity Consistency" },
  { key: "updateReadinessScore", label: "Update Readiness" },
];

// Readiness pill
function ReadinessPill({
  label,
  ok,
  okLabel,
  notOkLabel,
}: {
  label: string;
  ok: boolean;
  okLabel: string;
  notOkLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-medium ${
          ok
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-amber-300 bg-amber-50 text-amber-700"
        }`}
      >
        {ok ? okLabel : notOkLabel}
      </span>
    </div>
  );
}

// Draft-only readiness + next steps panel
function DraftReadinessPanel({
  lifecycleStatus,
  existsLive,
  currentLivePageVersionId,
  latestDraftId,
  hasDraft,
  hasLiveVersion,
  isVerifiedLive,
  isScanned,
  hasRecommendations,
  recommendationsCurrent,
}: {
  lifecycleStatus: string;
  existsLive: boolean;
  currentLivePageVersionId: string | null;
  latestDraftId: string | null;
  hasDraft: boolean;
  hasLiveVersion: boolean;
  isVerifiedLive: boolean;
  isScanned: boolean;
  hasRecommendations: boolean;
  recommendationsCurrent: boolean;
}) {
  const steps: Array<{ label: string; done: boolean; description: string }> = [
    {
      label: "Edit draft",
      done: hasDraft,
      description: "Fill in a title, meta description, and any content fields in the draft editor below.",
    },
    {
      label: "Apply draft",
      done: hasLiveVersion,
      description: "Apply the draft to make it the current live version of this page.",
    },
    {
      label: "Verify route",
      done: isVerifiedLive,
      description: "Confirm that the live URL is reachable and returns a valid HTML page.",
    },
    {
      label: "Scan page",
      done: isScanned,
      description: "Run a real scan to extract scores, findings, and content signals from the live page.",
    },
    {
      label: "Reconcile recommendations",
      done: hasRecommendations && recommendationsCurrent,
      description: "Generate recommendations from scan results so you know what to fix next.",
    },
  ];

  // First incomplete step
  const currentStepIndex = steps.findIndex((s) => !s.done);

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-soft">
      <div className="border-b border-amber-200 px-6 py-4">
        <h2 className="text-base font-semibold text-amber-900">Publish readiness</h2>
        <p className="mt-1 text-sm text-amber-700">
          This page is draft-only. Follow the steps below to make it live and tracked.
        </p>
      </div>

      {/* Metadata rows */}
      <div className="grid gap-x-8 gap-y-3 border-b border-amber-200 px-6 py-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-0.5">
          <p className="text-xs text-amber-700">Lifecycle status</p>
          <p className="text-sm font-medium text-amber-900">{lifecycleStatus}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-amber-700">Exists live</p>
          <p className="text-sm font-medium text-amber-900">{existsLive ? "Yes" : "No"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-amber-700">Current live version</p>
          <p className="truncate font-mono text-xs text-amber-900">{currentLivePageVersionId ?? "—"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-amber-700">Latest draft version</p>
          <p className="truncate font-mono text-xs text-amber-900">{latestDraftId ?? "—"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-amber-700">Route verified</p>
          <p className="text-sm font-medium text-amber-900">{isVerifiedLive ? "Yes" : "No"}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-xs text-amber-700">Scanned</p>
          <p className="text-sm font-medium text-amber-900">{isScanned ? "Yes" : "No"}</p>
        </div>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-6 px-6 py-5 border-b border-amber-200">
        <ReadinessPill
          label="Draft status"
          ok={false}
          okLabel="Live"
          notOkLabel="Draft only"
        />
        <ReadinessPill
          label="Draft exists"
          ok={hasDraft}
          okLabel="Draft ready"
          notOkLabel="No draft yet"
        />
        <ReadinessPill
          label="Live version"
          ok={hasLiveVersion}
          okLabel="Version exists"
          notOkLabel="No version yet"
        />
        <ReadinessPill
          label="Route verified"
          ok={isVerifiedLive}
          okLabel="Verified"
          notOkLabel="Not verified"
        />
        <ReadinessPill
          label="Scanned"
          ok={isScanned}
          okLabel="Scanned"
          notOkLabel="Not scanned"
        />
        <ReadinessPill
          label="Recommendations"
          ok={hasRecommendations && recommendationsCurrent}
          okLabel="Current"
          notOkLabel="Not generated"
        />
      </div>

      {/* Ordered steps */}
      <div className="divide-y divide-amber-200">
        {steps.map((step, i) => {
          const isCurrent = i === currentStepIndex;
          return (
            <div
              key={i}
              className={`flex items-start gap-4 px-6 py-4 ${
                step.done ? "opacity-50" : isCurrent ? "" : "opacity-70"
              }`}
            >
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  step.done
                    ? "border-emerald-400 bg-emerald-100 text-emerald-700"
                    : isCurrent
                      ? "border-amber-500 bg-amber-100 text-amber-800"
                      : "border-amber-300 bg-white text-amber-600"
                }`}
              >
                {step.done ? "✓" : i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    step.done
                      ? "text-muted-foreground line-through"
                      : isCurrent
                        ? "text-amber-900"
                        : "text-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {!step.done && (
                  <p className="mt-0.5 text-xs text-amber-700">{step.description}</p>
                )}
              </div>
              {isCurrent && (
                <span className="shrink-0 inline-flex rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Next
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function PageDetailPage({ params }: RouteProps) {
  const { pageId } = await params;

  let page: PageDetail;
  let recommendations: Recommendation[];
  let versions: VersionRecord[];
  let entitySignals: EntitySignalRecord[];
  let entities: EntityRecord[];
  let scoreHistory: ScoreHistoryRecord[];
  let changeLogs: ChangeLogRecord[];

  try {
    [page, recommendations, versions] = await Promise.all([
      apiFetch<PageDetail>(`/api/pages/${pageId}`),
      apiFetch<Recommendation[]>(`/api/pages/${pageId}/recommendations`),
      apiFetch<VersionRecord[]>(`/api/pages/${pageId}/versions`),
    ]);
    [entitySignals, entities, scoreHistory, changeLogs] = await Promise.all([
      apiFetch<EntitySignalRecord[]>(`/api/pages/${pageId}/entity-signals`),
      apiFetch<EntityRecord[]>(`/api/entities?workspaceId=${page.workspaceId}`),
      apiFetch<ScoreHistoryRecord[]>(`/api/pages/${pageId}/score-history`),
      apiFetch<ChangeLogRecord[]>(`/api/change-logs?pageId=${pageId}`),
    ]);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 404
    ) {
      notFound();
    }
    throw error;
  }

  const score = page.latestSuccessfulScoreSnapshot;
  const findings = page.latestSuccessfulScanRun?.findings ?? [];
  const latestHistory = scoreHistory[scoreHistory.length - 1] ?? null;
  const previousHistory = scoreHistory.length > 1 ? scoreHistory[scoreHistory.length - 2] : null;

  const isDraftOnly = page.lifecycleStatus === "DRAFT_ONLY";
  const hasLiveVersion = Boolean(page.currentLivePageVersionId);
  const isVerifiedLive = Boolean(page.existsLive && page.routeLastVerifiedAt);
  const isScannable = Boolean(hasLiveVersion && isVerifiedLive);
  const isScanned = Boolean(page.latestSuccessfulScanRun);
  const hasRecommendations = recommendations.length > 0;

  const activeRecommendationBatch = page.recommendationBatches[0] ?? null;
  const latestDraft = page.versions[0] ?? null;

  // Version diff helpers — use the full versions list from the dedicated API
  const liveVersion = versions.find((v) => v.id === page.currentLivePageVersionId) ?? null;
  const latestDraftVersion = versions.find((v) => v.contentState === "DRAFT") ?? null;
  const recommendationsCurrent = Boolean(
    activeRecommendationBatch &&
      activeRecommendationBatch.pageVersionId === page.currentLivePageVersionId &&
      activeRecommendationBatch.scanRunId === page.latestSuccessfulScanRun?.id,
  );

  const activeRecommendationCount = recommendations.filter(
    (r) => r.status === "OPEN",
  ).length;

  const latestRecoDraft =
    versions.find(
      (v) =>
        v.contentState === "DRAFT" &&
        v.createdBy === "recommendation-generation" &&
        typeof v.extractedJson === "object" &&
        v.extractedJson !== null &&
        !Array.isArray(v.extractedJson) &&
        (v.extractedJson as Record<string, unknown>).source ===
          "recommendation-generation",
    ) ?? null;

  const scannableHint = isScannable
    ? "This page has a verified live route and can be scanned now."
    : hasLiveVersion
      ? "This page has a live version but the route is not verified yet."
      : "This page is not scannable — it is missing a current live version.";

  const STALE_MS = 14 * 24 * 60 * 60 * 1000;
  const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
  const scanCompletedAt = page.latestSuccessfulScanRun?.completedAt ?? null;
  const scanAge = scanCompletedAt ? Date.now() - new Date(scanCompletedAt).getTime() : null;
  const scanFreshnessLabel =
    !hasLiveVersion
      ? null
      : !scanCompletedAt
        ? "Never scanned"
        : scanAge! <= FRESH_MS
          ? "Fresh"
          : scanAge! > STALE_MS
            ? "Stale — re-audit recommended"
            : "Aging";
  const needsReaudit = hasLiveVersion && (!scanCompletedAt || (scanAge != null && scanAge > STALE_MS));

  // Internal link health — derived from currentLivePageVersion.extractedJson
  const liveExtracted =
    page.currentLivePageVersion?.extractedJson != null &&
    typeof page.currentLivePageVersion.extractedJson === "object" &&
    !Array.isArray(page.currentLivePageVersion.extractedJson)
      ? (page.currentLivePageVersion.extractedJson as Record<string, unknown>)
      : null;
  const liveInternalLinkCount =
    liveExtracted !== null && typeof liveExtracted.internalLinkCount === "number"
      ? liveExtracted.internalLinkCount
      : null;
  const isWeaklyLinked = liveInternalLinkCount !== null && liveInternalLinkCount < 3;
  const liveTextLength =
    liveExtracted !== null && typeof liveExtracted.textLength === "number"
      ? liveExtracted.textLength
      : null;
  const isStrongCandidate = isWeaklyLinked && liveTextLength !== null && liveTextLength > 2000;

  // Schema + content gap analysis — derived from currentLivePageVersion.extractedJson
  const liveSignals = liveExtracted as {
    hasJsonLd?: boolean;
    schemaTypeHints?: string[];
    hasFaqSchema?: boolean;
    hasArticleSchema?: boolean;
    hasOrganizationSchema?: boolean;
    hasPersonSchema?: boolean;
    hasFaqSection?: boolean;
    hasAuthorOrReviewer?: boolean;
    hasDateOrUpdate?: boolean;
    indexabilityHint?: string;
    canonicalMatchesPage?: boolean | null;
    h1Count?: number;
    headingCount?: number;
    paragraphCount?: number;
    textLength?: number;
  } | null;

  const schemaScanned = liveSignals !== null && typeof liveSignals.hasJsonLd === "boolean";
  const structuredDataPresent = liveSignals?.hasJsonLd ?? null;
  const schemaHints = Array.isArray(liveSignals?.schemaTypeHints) ? liveSignals!.schemaTypeHints : [];
  const faqSchemaGap =
    liveSignals?.hasFaqSection === true && liveSignals?.hasFaqSchema !== true;
  const authoritySchemaGap =
    liveSignals?.hasAuthorOrReviewer === true &&
    liveSignals?.hasOrganizationSchema !== true &&
    liveSignals?.hasPersonSchema !== true;
  const weakSchemaSupport =
    liveSignals?.hasJsonLd === true &&
    !liveSignals?.hasFaqSchema &&
    !liveSignals?.hasArticleSchema &&
    !liveSignals?.hasOrganizationSchema &&
    !liveSignals?.hasPersonSchema;
  const canonicalIndexRisk =
    liveSignals?.canonicalMatchesPage === false || liveSignals?.indexabilityHint === "noindex";

  const schemaGaps: string[] = [];
  if (schemaScanned) {
    if (!structuredDataPresent)
      schemaGaps.push("No JSON-LD or structured data detected.");
    if (weakSchemaSupport)
      schemaGaps.push(
        schemaHints.length === 0
          ? "JSON-LD present but no recognised schema types identified."
          : `Schema types (${schemaHints.join(", ")}) present but no specific FAQ/Article/Person/Org type matched.`,
      );
    if (faqSchemaGap)
      schemaGaps.push("FAQ-like content detected but FAQPage schema is missing.");
    if (authoritySchemaGap)
      schemaGaps.push("Author/reviewer signals detected but no Person or Organization schema.");
    if (liveSignals?.canonicalMatchesPage === false)
      schemaGaps.push("Canonical URL mismatch — structured data signals may be weakened.");
    if (liveSignals?.indexabilityHint === "noindex")
      schemaGaps.push("Page is noindex — crawlers may ignore structured data.");
  }

  // Content opportunity analysis — derived from liveSignals + score
  const contentScanned = liveSignals !== null && typeof liveSignals.textLength === "number";
  const liveTextLengthVal = typeof liveSignals?.textLength === "number" ? liveSignals.textLength : null;
  const liveParagraphCount = typeof liveSignals?.paragraphCount === "number" ? liveSignals.paragraphCount : null;
  const liveHeadingCount = typeof liveSignals?.headingCount === "number" ? liveSignals.headingCount : null;
  const liveH1Count = typeof liveSignals?.h1Count === "number" ? liveSignals.h1Count : null;
  const liveHasFaqSection = typeof liveSignals?.hasFaqSection === "boolean" ? liveSignals.hasFaqSection : null;
  const liveHasAuthorSignal = typeof liveSignals?.hasAuthorOrReviewer === "boolean" ? liveSignals.hasAuthorOrReviewer : null;
  const liveHasDateSignal = typeof liveSignals?.hasDateOrUpdate === "boolean" ? liveSignals.hasDateOrUpdate : null;

  const answerClarityVal = score?.answerClarityScore != null ? Number(score.answerClarityScore) : null;

  const weakDirectAnswer =
    contentScanned &&
    ((liveParagraphCount !== null && liveParagraphCount < 2) ||
      (answerClarityVal !== null && answerClarityVal < 40 && (liveHeadingCount ?? 0) < 2) ||
      ((liveTextLengthVal ?? 0) > 500 && (liveParagraphCount ?? 0) < 3 && (liveHeadingCount ?? 0) < 2));

  const weakHeadings =
    contentScanned &&
    (liveH1Count === 0 ||
      (liveHeadingCount !== null && liveHeadingCount < 2) ||
      ((liveTextLengthVal ?? 0) > 1000 && (liveHeadingCount ?? 0) < 3));

  const faqOpportunity =
    contentScanned &&
    liveHasFaqSection !== true &&
    (liveTextLengthVal ?? 0) > 800 &&
    (liveParagraphCount ?? 0) >= 4;

  const thinContent =
    contentScanned &&
    ((liveTextLengthVal ?? 0) < 300 || (liveParagraphCount !== null && liveParagraphCount < 2));

  const missingEvidence =
    contentScanned && liveHasAuthorSignal !== true && liveHasDateSignal !== true;

  const contentGaps: string[] = [];
  if (contentScanned) {
    if (weakDirectAnswer)
      contentGaps.push(
        (liveParagraphCount ?? 0) < 2
          ? "Very few paragraphs — content may not deliver a direct answer near the top."
          : "Low heading count or answer clarity — structure the top of the page to answer the core query directly.",
      );
    if (weakHeadings)
      contentGaps.push(
        liveH1Count === 0
          ? "No H1 heading detected — page is missing a primary topic signal."
          : (liveHeadingCount ?? 0) < 2
            ? "Only one heading found — add subheadings to segment content."
            : "Long content with few headings — add H2/H3 structure to improve extraction.",
      );
    if (faqOpportunity)
      contentGaps.push(
        "Substantial content without a FAQ section — a Q&A block would improve answer coverage.",
      );
    if (thinContent)
      contentGaps.push(
        (liveTextLengthVal ?? 0) < 300
          ? `Only ${liveTextLengthVal ?? 0} characters of text — too thin to answer meaningful queries.`
          : "Very few paragraphs — expand content with clearly structured sections.",
      );
    if (missingEvidence)
      contentGaps.push(
        "No author, reviewer, or date signal detected — add a byline or publish date to establish trust and freshness.",
      );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <Link
          className="text-sm text-muted-foreground transition hover:text-foreground"
          href="/pages"
        >
          ← Back to pages
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              {page.title?.trim() || "Untitled Page"}
            </h1>
            <p className="font-mono text-sm text-muted-foreground">{page.path}</p>
          </div>
          {isDraftOnly && (
            <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Draft only
            </span>
          )}
        </div>
      </div>

      {/* Draft-only readiness panel */}
      {isDraftOnly && (
        <DraftReadinessPanel
          lifecycleStatus={page.lifecycleStatus}
          existsLive={page.existsLive}
          currentLivePageVersionId={page.currentLivePageVersionId}
          latestDraftId={latestDraft?.id ?? null}
          hasDraft={latestDraft !== null}
          hasLiveVersion={hasLiveVersion}
          isVerifiedLive={isVerifiedLive}
          isScanned={isScanned}
          hasRecommendations={hasRecommendations}
          recommendationsCurrent={recommendationsCurrent}
        />
      )}

      {/* Status overview cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailCard label="Status" value={page.lifecycleStatus} />
        <DetailCard label="Page type" value={page.pageType || "Not set"} />
        <DetailCard label="Live" value={page.existsLive ? "Yes" : "No"} />
        <DetailCard label="Scannable" value={isScannable ? "Yes" : "No"} />
      </section>

      {/* Scannable hint */}
      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-soft">
        {scannableHint}
      </section>

      {/* Draft editing + workflow actions */}
      <PageDetailActions
        drafts={page.versions}
        pageId={page.id}
        versions={versions}
        workspaceId={page.workspaceId}
      />

      {/* Live vs draft diff */}
      <LiveVsDraftDiff liveVersion={liveVersion} draftVersion={latestDraftVersion} />

      {/* Version history */}
      <VersionHistorySection versions={versions} />

      {/* Audit trail */}
      <AuditTrailSection changeLogs={changeLogs} />

      <PageEntitySignalForm
        entities={entities}
        pageId={page.id}
        pageVersionId={page.currentLivePageVersionId}
      />

      {/* Extracted page signals */}
      <ExtractedSignalsSection extractedJson={page.currentLivePageVersion?.extractedJson ?? null} />

      {/* Schema opportunities */}
      {schemaScanned ? (
        <SchemaOpportunitiesSection
          structuredDataPresent={structuredDataPresent}
          schemaHints={schemaHints}
          faqSchemaGap={faqSchemaGap}
          authoritySchemaGap={authoritySchemaGap}
          weakSchemaSupport={weakSchemaSupport}
          canonicalIndexRisk={canonicalIndexRisk}
          gaps={schemaGaps}
        />
      ) : null}

      {/* Content opportunities */}
      {contentScanned ? (
        <ContentOpportunitiesSection
          weakDirectAnswer={weakDirectAnswer}
          weakHeadings={weakHeadings}
          faqOpportunity={faqOpportunity}
          thinContent={thinContent}
          missingEvidence={missingEvidence}
          textLength={liveTextLengthVal}
          paragraphCount={liveParagraphCount}
          headingCount={liveHeadingCount}
          h1Count={liveH1Count}
          hasFaqSection={liveHasFaqSection}
          hasAuthorSignal={liveHasAuthorSignal}
          hasDateSignal={liveHasDateSignal}
          gaps={contentGaps}
        />
      ) : null}

      {/* Latest scan findings */}
      <ScanFindingsSection scanRun={page.latestSuccessfulScanRun} />

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {/* Live version summary */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Live version</h2>
              <p className="text-sm text-muted-foreground">
                Current live version, scan state, and route readiness.
              </p>
            </div>
            <dl className="grid gap-4 md:grid-cols-2">
              <DetailRow
                label="Current live version"
                value={
                  page.currentLivePageVersion?.id ??
                  page.currentLivePageVersionId ??
                  "None"
                }
                mono
              />
              <DetailRow label="Latest draft" value={latestDraft?.id ?? "None"} mono />
              <DetailRow
                label="Exists live"
                value={page.existsLive ? "Yes" : "No"}
              />
              <DetailRow
                label="Route verified"
                value={isVerifiedLive ? "Verified" : "Not verified"}
              />
              <DetailRow
                label="Last verified"
                value={
                  page.routeLastVerifiedAt
                    ? formatDate(page.routeLastVerifiedAt)
                    : "Never"
                }
              />
              <DetailRow
                label="Latest scan"
                value={page.latestSuccessfulScanRun?.status ?? "None"}
              />
              <DetailRow
                label="Scan completed"
                value={scanCompletedAt ? formatDate(scanCompletedAt) : "Never"}
              />
              {scanFreshnessLabel ? (
                <DetailRow label="Scan freshness" value={scanFreshnessLabel} />
              ) : null}
              <DetailRow
                label="Latest score"
                value={formatScore(score?.overallScore)}
              />
              <DetailRow label="Blockers" value={String(score?.blockersCount ?? 0)} />
              <DetailRow
                label="Recommendations"
                value={String(recommendations.length)}
              />
              <DetailRow
                label="Recommendations current"
                value={recommendationsCurrent ? "Yes" : "No"}
              />
              {liveInternalLinkCount !== null ? (
                <DetailRow
                  label="Internal links"
                  value={`${liveInternalLinkCount}${isWeaklyLinked ? " — weakly linked" : ""}`}
                />
              ) : null}
              {isStrongCandidate ? (
                <DetailRow label="Link opportunity" value="Strong candidate for more links" />
              ) : null}
            </dl>
          </section>

          {/* Scores */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Scores</h2>
              <p className="text-sm text-muted-foreground">
                Component scores from the latest successful scan.
              </p>
            </div>
            {!score ? (
              <EmptyState
                title="No score snapshot yet"
                body="Run a scan to create the first score for this page."
              />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {scoreFields.map((field) => {
                    const v = score[field.key];
                    const display = Array.isArray(v) ? v.join(", ") : v;
                    return (
                      <DetailCard
                        key={field.key}
                        label={field.label}
                        value={formatScore(display)}
                      />
                    );
                  })}
                </div>
                <WhyThisScore score={score} findings={findings} />
              </div>
            )}
          </section>

          {/* Score history */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Score history</h2>
              <p className="text-sm text-muted-foreground">
                Before and after measurement across persisted snapshots.
              </p>
            </div>
            {scoreHistory.length === 0 ? (
              <EmptyState
                title="No score history yet"
                body="Run a scan to create the first measurement entry."
              />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <DetailCard
                    label="Latest score"
                    value={formatScore(latestHistory?.overallScore)}
                  />
                  <DetailCard
                    label="Previous score"
                    value={formatScore(previousHistory?.overallScore ?? null)}
                  />
                  <DetailCard
                    label="Delta"
                    value={
                      latestHistory?.delta == null ? "-" : latestHistory.delta.toFixed(2)
                    }
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-secondary/60">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Score
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Delta
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Blockers
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Confidence
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {scoreHistory.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatScore(entry.overallScore)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {entry.delta == null ? "-" : entry.delta.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {entry.blockersCount}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatScore(entry.confidence)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(entry.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* Authority */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Authority</h2>
              <p className="text-sm text-muted-foreground">
                Trust, expert visibility, and entity signals.
              </p>
            </div>
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <DetailCard
                label="Authority Trust"
                value={formatScore(score?.authorityTrustScore)}
              />
              <DetailCard
                label="Expert Visibility"
                value={formatScore(score?.expertVisibilityScore)}
              />
              <DetailCard
                label="Entity Consistency"
                value={formatScore(score?.entityConsistencyScore)}
              />
            </div>

            {/* Authority findings */}
            {findings.filter(
              (f) => f.findingType === "AUTHORITY_GAP" || f.findingType === "ENTITY_GAP",
            ).length > 0 && (
              <div className="mb-6 space-y-3">
                <h3 className="text-sm font-medium text-foreground">Authority findings</h3>
                {findings
                  .filter(
                    (f) =>
                      f.findingType === "AUTHORITY_GAP" || f.findingType === "ENTITY_GAP",
                  )
                  .map((finding) => (
                    <div key={finding.id} className="rounded-xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">
                            {finding.title}
                          </h4>
                          <p className="mt-0.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            {finding.code}
                          </p>
                        </div>
                        <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                          {finding.findingType}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        {finding.explanation || "No explanation recorded."}
                      </p>
                    </div>
                  ))}
              </div>
            )}

            {/* Entity signals */}
            <div className="mb-3 space-y-1">
              <h3 className="text-sm font-medium text-foreground">Entity signals</h3>
            </div>
            {entitySignals.length === 0 ? (
              <EmptyState
                title="No entity signals yet"
                body="Add an entity signal to track authority evidence."
              />
            ) : (
              <div className="space-y-3">
                {entitySignals.map((signal) => (
                  <div key={signal.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                        {signal.signalType}
                      </span>
                      <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {formatScore(signal.visibilityScore)}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-medium text-foreground">
                      {signal.entity.name}
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Added {formatDate(signal.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recommendations */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Recommendations</h2>
              <p className="text-sm text-muted-foreground">
                Generated from the latest scan state.
              </p>
            </div>
            {recommendations.length === 0 ? (
              <EmptyState
                title="No recommendations yet"
                body="Generate recommendations after a successful scan."
              />
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                        {rec.type}
                      </span>
                      <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {rec.status}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-medium text-foreground">{rec.title}</h3>
                    {rec.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{rec.description}</p>
                    )}
                    {rec.whyItMatters && (
                      <p className="mt-2 text-sm text-muted-foreground">{rec.whyItMatters}</p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Created {formatDate(rec.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {/* Generate Draft from Recommendations */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Generate draft from recommendations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn active recommendations into a structured content draft plan. This does not
            publish anything — applying the draft is a separate action.
          </p>
        </div>
        <div className="px-6 py-5">
          {activeRecommendationCount === 0 ? (
            <EmptyState
              title="No active recommendations"
              body="Run a scan and generate recommendations first, then use this tool to create a draft plan."
            />
          ) : (
            <GenerateDraftForm
              pageId={page.id}
              activeRecommendationCount={activeRecommendationCount}
            />
          )}
        </div>
      </section>

      {/* Latest recommendation-generated draft plan */}
      {latestRecoDraft && <RecommendationDraftPanel draft={latestRecoDraft} />}
    </div>
  );
}

// ─── Schema opportunities ─────────────────────────────────────────────────────

function SchemaOpportunitiesSection({
  structuredDataPresent,
  schemaHints,
  faqSchemaGap,
  authoritySchemaGap,
  weakSchemaSupport,
  canonicalIndexRisk,
  gaps,
}: {
  structuredDataPresent: boolean | null;
  schemaHints: string[];
  faqSchemaGap: boolean;
  authoritySchemaGap: boolean;
  weakSchemaSupport: boolean;
  canonicalIndexRisk: boolean;
  gaps: string[];
}) {
  const hasAnyGap = gaps.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Schema opportunities</h2>
        <p className="text-sm text-muted-foreground">
          Gaps between page content signals and structured data markup.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <p className="text-xs text-muted-foreground">Structured data</p>
          <p
            className={`mt-1 text-sm font-semibold ${
              structuredDataPresent === false
                ? "text-red-700"
                : structuredDataPresent === true
                  ? "text-emerald-700"
                  : "text-muted-foreground"
            }`}
          >
            {structuredDataPresent === null
              ? "Unknown"
              : structuredDataPresent
                ? "Present"
                : "Missing"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <p className="text-xs text-muted-foreground">Schema types</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {schemaHints.length > 0 ? schemaHints.join(", ") : "None detected"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-secondary/40 p-3">
          <p className="text-xs text-muted-foreground">Gaps found</p>
          <p
            className={`mt-1 text-sm font-semibold ${gaps.length > 0 ? "text-amber-700" : "text-emerald-700"}`}
          >
            {gaps.length === 0 ? "None" : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: "FAQ schema gap", active: faqSchemaGap },
          { label: "Authority schema gap", active: authoritySchemaGap },
          { label: "Weak schema support", active: weakSchemaSupport },
          { label: "Canonical / indexability risk", active: canonicalIndexRisk },
        ].map(({ label, active }) => (
          <span
            key={label}
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
              active
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {active ? "⚠ " : "✓ "}
            {label}
          </span>
        ))}
      </div>

      {hasAnyGap ? (
        <ul className="mt-4 space-y-1.5">
          {gaps.map((gap, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-0.5 shrink-0 text-amber-600">•</span>
              {gap}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-emerald-700">
          No schema gaps detected — structured data appears complete for this page.
        </p>
      )}
    </section>
  );
}

// ─── Content opportunities ────────────────────────────────────────────────────

function ContentOpportunitiesSection({
  weakDirectAnswer,
  weakHeadings,
  faqOpportunity,
  thinContent,
  missingEvidence,
  textLength,
  paragraphCount,
  headingCount,
  h1Count,
  hasFaqSection,
  hasAuthorSignal,
  hasDateSignal,
  gaps,
}: {
  weakDirectAnswer: boolean;
  weakHeadings: boolean;
  faqOpportunity: boolean;
  thinContent: boolean;
  missingEvidence: boolean;
  textLength: number | null;
  paragraphCount: number | null;
  headingCount: number | null;
  h1Count: number | null;
  hasFaqSection: boolean | null;
  hasAuthorSignal: boolean | null;
  hasDateSignal: boolean | null;
  gaps: string[];
}) {
  const hasAnyGap = gaps.length > 0;

  const checks = [
    {
      label: "Direct answer",
      ok: !weakDirectAnswer,
      okLabel: "Answer-ready",
      notOkLabel: "Improve structure",
      detail:
        paragraphCount !== null
          ? `${paragraphCount} paragraph${paragraphCount !== 1 ? "s" : ""}`
          : null,
    },
    {
      label: "Heading structure",
      ok: !weakHeadings,
      okLabel: "Good structure",
      notOkLabel: h1Count === 0 ? "Missing H1" : "Add subheadings",
      detail:
        headingCount !== null ? `${headingCount} heading${headingCount !== 1 ? "s" : ""}` : null,
    },
    {
      label: "FAQ / Q&A section",
      ok: !faqOpportunity,
      okLabel: hasFaqSection ? "FAQ present" : "Not needed",
      notOkLabel: "Add FAQ section",
      detail: textLength !== null ? `${textLength.toLocaleString()} chars` : null,
    },
    {
      label: "Content depth",
      ok: !thinContent,
      okLabel: "Sufficient depth",
      notOkLabel: "Thin content",
      detail: textLength !== null ? `${textLength.toLocaleString()} chars` : null,
    },
    {
      label: "Freshness & evidence",
      ok: !missingEvidence,
      okLabel: "Evidence present",
      notOkLabel: "Add author / date",
      detail:
        hasAuthorSignal !== null || hasDateSignal !== null
          ? [hasAuthorSignal ? "author ✓" : "no author", hasDateSignal ? "date ✓" : "no date"].join(
              ", ",
            )
          : null,
    },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Content opportunities</h2>
        <p className="text-sm text-muted-foreground">
          Answer readiness, extractability, and evidence gaps from real scan signals.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {checks.map(({ label, ok, okLabel, notOkLabel, detail }) => (
          <div key={label} className="rounded-xl border border-border bg-secondary/40 p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p
              className={`mt-1 text-sm font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}
            >
              {ok ? okLabel : notOkLabel}
            </p>
            {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
          </div>
        ))}
      </div>

      {hasAnyGap ? (
        <ul className="mt-4 space-y-1.5">
          {gaps.map((gap, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-0.5 shrink-0 text-amber-600">•</span>
              {gap}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-emerald-700">
          No content structure gaps detected — page appears answer-ready and well-structured.
        </p>
      )}
    </section>
  );
}

// ─── Extracted signals helpers ───────────────────────────────────────────────

type ExtractedSignals = {
  finalUrl?: string;
  title?: string;
  metaDescription?: string;
  canonicalHref?: string | null;
  robotsMetaContent?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  hasJsonLd?: boolean;
  schemaTypeHints?: string[];
  indexabilityHint?: string;
  canonicalMatchesPage?: boolean | null;
  listCount?: number;
  tableCount?: number;
  hasFaqSchema?: boolean;
  hasArticleSchema?: boolean;
  hasOrganizationSchema?: boolean;
  hasPersonSchema?: boolean;
  discoveredFromUrls?: string[];
  discoveredFromPaths?: string[];
  outboundInternalPaths?: string[];
  outboundInternalLinkCount?: number;
  source?: string | null;
  h1Count?: number;
  headingCount?: number;
  paragraphCount?: number;
  internalLinkCount?: number;
  externalLinkCount?: number;
  textLength?: number;
  hasFaqSection?: boolean;
  hasAuthorOrReviewer?: boolean;
  hasDateOrUpdate?: boolean;
  entitySignalCount?: number;
  fetchedAt?: string;
};

function parseExtractedSignals(raw: unknown): ExtractedSignals | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as ExtractedSignals;
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

function boolSignal(value: boolean | undefined): string {
  if (value === undefined) return "—";
  return value ? "Yes" : "No";
}

function shortText(value: string | null | undefined, max = 80) {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function ExtractedSignalsSection({ extractedJson }: { extractedJson: unknown }) {
  const signals = parseExtractedSignals(extractedJson);
  const crawlSource = parseCrawlSourceSummary(extractedJson);
  const schemaHints = signals?.schemaTypeHints?.length ? signals.schemaTypeHints.join(", ") : "—";
  const technicalSummary = signals?.hasJsonLd
    ? `Structured data present${signals.schemaTypeHints?.length ? ` (${signals.schemaTypeHints.join(", ")})` : ""}`
    : "Structured data not detected";

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Technical signals</h2>
        <p className="text-sm text-muted-foreground">
          Real scan evidence for canonical setup, indexability, structure, and extractability.
        </p>
      </div>

      {!signals ? (
        <EmptyState
          title="No technical signals yet"
          body="Run a scan to extract real technical signals from the live page."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DetailCard label="Indexability" value={signals.indexabilityHint || "—"} />
            <DetailCard
              label="Canonical match"
              value={
                signals.canonicalMatchesPage == null
                  ? "Unknown"
                  : signals.canonicalMatchesPage
                    ? "Matches"
                    : "Mismatch"
              }
            />
            <DetailCard label="Structured data" value={signals.hasJsonLd ? "Present" : "Missing"} />
            <DetailCard label="Lists" value={signals.listCount !== undefined ? String(signals.listCount) : "—"} />
            <DetailCard label="Tables" value={signals.tableCount !== undefined ? String(signals.tableCount) : "—"} />
            <DetailCard label="FAQ structure" value={signals.hasFaqSection || signals.hasFaqSchema ? "Present" : "Missing"} />
          </div>

          <div className="divide-y divide-border">
            {signals.finalUrl && <SignalRow label="Fetched URL" value={signals.finalUrl} />}
            {signals.fetchedAt && <SignalRow label="Fetched at" value={formatDate(signals.fetchedAt)} />}
            <SignalRow label="Title" value={signals.title?.trim() || "—"} />
            <SignalRow label="Canonical" value={shortText(signals.canonicalHref)} />
            <SignalRow label="Robots meta" value={shortText(signals.robotsMetaContent)} />
            <SignalRow label="Meta description" value={shortText(signals.metaDescription)} />
            <SignalRow label="OG title" value={shortText(signals.ogTitle)} />
            <SignalRow label="OG description" value={shortText(signals.ogDescription)} />
            <SignalRow label="Structured summary" value={technicalSummary} />
            <SignalRow label="Schema hints" value={schemaHints} />
            <SignalRow label="Authority schema" value={signals.hasOrganizationSchema || signals.hasPersonSchema ? "Present" : "Missing"} />
            <SignalRow label="Article schema" value={boolSignal(signals.hasArticleSchema)} />
            <SignalRow label="Discovery source" value={crawlSource.source ?? "—"} />
            <SignalRow label="Discovered from" value={crawlSource.discoveredFromCount > 0 ? `${crawlSource.discoveredFromCount} source${crawlSource.discoveredFromCount === 1 ? "" : "s"}` : "None stored"} />
            <SignalRow label="Sample source paths" value={crawlSource.discoveredFromPaths.length > 0 ? crawlSource.discoveredFromPaths.slice(0, 3).join(", ") : "—"} />
            <SignalRow label="Orphan-like inference" value={crawlSource.inferenceAvailable ? (crawlSource.orphanLike ? "Possible orphan-like page" : "Enough crawl data to assess") : "Not enough crawl data yet"} />
            <SignalRow label="Outbound internal links" value={crawlSource.outboundInternalLinkCount != null ? String(crawlSource.outboundInternalLinkCount) : "—"} />
            <SignalRow label="H1 headings" value={signals.h1Count !== undefined ? String(signals.h1Count) : "—"} />
            <SignalRow label="Total headings" value={signals.headingCount !== undefined ? String(signals.headingCount) : "—"} />
            <SignalRow label="Paragraphs" value={signals.paragraphCount !== undefined ? String(signals.paragraphCount) : "—"} />
            <SignalRow label="Internal links" value={signals.internalLinkCount !== undefined ? String(signals.internalLinkCount) : "—"} />
            <SignalRow label="External links" value={signals.externalLinkCount !== undefined ? String(signals.externalLinkCount) : "—"} />
            <SignalRow label="Text length" value={signals.textLength !== undefined ? `${signals.textLength.toLocaleString()} chars` : "—"} />
            <SignalRow label="Author / reviewer words" value={boolSignal(signals.hasAuthorOrReviewer)} />
            <SignalRow label="Date / update words" value={boolSignal(signals.hasDateOrUpdate)} />
            {signals.entitySignalCount !== undefined && <SignalRow label="Entity signals" value={String(signals.entitySignalCount)} />}
          </div>

          <details className="rounded-xl border border-border bg-secondary/30 p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">Advanced raw extraction</summary>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(signals, null, 2)}</pre>
          </details>
        </div>
      )}
    </section>
  );
}

// ─── Finding type → colour ────────────────────────────────────────────────────

function findingTypeStyle(type: string): string {
  switch (type) {
    case "BLOCKER":
      return "border-red-300 bg-red-50 text-red-700";
    case "WARNING":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "AUTHORITY_GAP":
    case "ENTITY_GAP":
      return "border-orange-300 bg-orange-50 text-orange-700";
    case "EXTRACTABILITY_GAP":
    case "FRESHNESS_GAP":
    case "LINK_GAP":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "STRENGTH":
      return "border-emerald-300 bg-emerald-50 text-emerald-700";
    default:
      return "border-border bg-secondary text-foreground";
  }
}

function severityBar(severity: number) {
  const pct = Math.min(100, Math.max(0, severity));
  const colour =
    pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : pct >= 40 ? "bg-blue-500" : "bg-emerald-500";
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-border">
        <div className={`h-1.5 rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{severity}</span>
    </div>
  );
}

function evidenceSummary(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const skip = new Set(["pageId", "pageVersionId"]);
  const entries = Object.entries(obj)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined)
    .slice(0, 4)
    .map(([k, v]) => {
      const display = Array.isArray(v) ? v.slice(0, 3).join(", ") : String(v).slice(0, 60);
      return `${k}: ${display}`;
    });
  return entries.length > 0 ? entries.join(" · ") : null;
}

type FindingRecord = {
  id: string;
  findingType: string;
  code: string;
  title: string;
  severity: number;
  explanation: string | null;
  evidenceJson: unknown;
};

function FindingCard({ finding }: { finding: FindingRecord }) {
  const evidence = evidenceSummary(finding.evidenceJson);
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{finding.title}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{finding.code}</p>
        </div>
        <span
          className={`shrink-0 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${findingTypeStyle(finding.findingType)}`}
        >
          {finding.findingType}
        </span>
      </div>
      {finding.explanation && (
        <p className="mt-2 text-sm text-muted-foreground">{finding.explanation}</p>
      )}
      {evidence && (
        <p className="mt-2 text-xs text-muted-foreground">Evidence: {evidence}</p>
      )}
      {severityBar(finding.severity)}
    </div>
  );
}

function ScanFindingsSection({
  scanRun,
}: {
  scanRun: NonNullable<PageDetail["latestSuccessfulScanRun"]> | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Latest scan findings</h2>
        <p className="text-sm text-muted-foreground">
          {scanRun?.completedAt
            ? `From scan completed ${formatDate(scanRun.completedAt)} · sorted by severity.`
            : "Findings from the latest successful scan."}
        </p>
      </div>

      {!scanRun || scanRun.findings.length === 0 ? (
        <EmptyState
          title="No findings yet"
          body="Run a scan to generate findings for this page."
        />
      ) : (
        <div className="space-y-3">
          {scanRun.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Score explanation ────────────────────────────────────────────────────────

function WhyThisScore({
  score,
  findings,
}: {
  score: NonNullable<PageDetail["latestSuccessfulScoreSnapshot"]>;
  findings: Array<{ findingType: string; title: string }>;
}) {
  const blockers = findings.filter((f) => f.findingType === "BLOCKER");
  const warnings = findings.filter((f) => f.findingType === "WARNING");
  const gaps = findings.filter(
    (f) =>
      f.findingType === "AUTHORITY_GAP" ||
      f.findingType === "ENTITY_GAP" ||
      f.findingType === "EXTRACTABILITY_GAP" ||
      f.findingType === "FRESHNESS_GAP" ||
      f.findingType === "LINK_GAP",
  );

  const hasCodes = score.reasonCodesJson && score.reasonCodesJson.length > 0;

  if (!hasCodes && blockers.length === 0 && warnings.length === 0) return null;

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
      <h3 className="text-sm font-semibold text-foreground">Why this score</h3>

      {score.blockersCount > 0 && (
        <p className="text-sm text-red-700">
          {score.blockersCount} blocker{score.blockersCount !== 1 ? "s" : ""} detected:{" "}
          {blockers.map((f) => f.title).join(", ")}
        </p>
      )}
      {warnings.length > 0 && (
        <p className="text-sm text-amber-700">
          {warnings.length} warning{warnings.length !== 1 ? "s" : ""}: {warnings.map((f) => f.title).join(", ")}
        </p>
      )}
      {gaps.length > 0 && (
        <p className="text-sm text-blue-700">
          {gaps.length} content gap{gaps.length !== 1 ? "s" : ""} affecting authority and extractability.
        </p>
      )}

      {hasCodes && (
        <div className="flex flex-wrap gap-1.5">
          {score.reasonCodesJson!.map((code) => (
            <span
              key={code}
              className="inline-flex rounded-md border border-border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function payloadSummary(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const entries = Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`);
  return entries.length > 0 ? entries.join(" · ") : null;
}

function AuditTrailSection({ changeLogs }: { changeLogs: ChangeLogRecord[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Audit trail</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recorded actions for this page, newest first.
        </p>
      </div>
      {changeLogs.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No audit entries yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Actions such as scans, draft applies, and reconciles will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Action</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Object</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Detail</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {changeLogs.map((entry) => {
                const summary = payloadSummary(entry.payloadJson);
                return (
                  <tr key={entry.id}>
                    <td className="px-5 py-3">
                      <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                        {entry.actionType}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{entry.objectType}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {summary ?? <span className="italic">—</span>}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatDate(entry.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DiffRow({
  label,
  liveValue,
  draftValue,
}: {
  label: string;
  liveValue: string | null;
  draftValue: string | null;
}) {
  const live = liveValue?.trim() || null;
  const draft = draftValue?.trim() || null;
  const changed = live !== draft;

  return (
    <div
      className={`grid gap-2 rounded-xl border p-4 md:grid-cols-[1fr_1fr] ${
        changed ? "border-amber-200 bg-amber-50/40" : "border-border bg-card"
      }`}
    >
      <div className="md:col-span-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {changed ? (
          <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Changed
          </span>
        ) : (
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            Identical
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Live</p>
        <p className="text-sm text-foreground">{live ?? <span className="italic text-muted-foreground">—</span>}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Draft</p>
        <p className="text-sm text-foreground">{draft ?? <span className="italic text-muted-foreground">—</span>}</p>
      </div>
    </div>
  );
}

function extractJsonSummary(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? "(empty)" : trimmed.slice(0, 120) + (trimmed.length > 120 ? "…" : "");
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length === 0 ? "(empty object)" : `{${keys.slice(0, 6).join(", ")}${keys.length > 6 ? ", …" : ""}} — ${keys.length} field(s)`;
  }
  return String(value);
}

function LiveVsDraftDiff({
  liveVersion,
  draftVersion,
}: {
  liveVersion: VersionRecord | null;
  draftVersion: VersionRecord | null;
}) {
  if (!liveVersion && !draftVersion) return null;

  const noDraft = !draftVersion;
  const hasBoth = liveVersion && draftVersion;

  const titleChanged = hasBoth && (liveVersion.title?.trim() ?? null) !== (draftVersion.title?.trim() ?? null);
  const metaChanged = hasBoth && (liveVersion.metaDescription?.trim() ?? null) !== (draftVersion.metaDescription?.trim() ?? null);
  const jsonLive = extractJsonSummary(liveVersion?.extractedJson);
  const jsonDraft = extractJsonSummary(draftVersion?.extractedJson);
  const jsonChanged = hasBoth && jsonLive !== jsonDraft;
  const anyChanged = titleChanged || metaChanged || jsonChanged;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Live vs draft</h2>
        <p className="text-sm text-muted-foreground">
          Field-by-field comparison between the current live version and the latest draft.
        </p>
      </div>

      {noDraft ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No draft version</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a draft in the workflow panel to compare changes before applying.
          </p>
        </div>
      ) : !liveVersion ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No live version yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Apply the draft to create the first live version.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Live version</p>
              <p className="font-mono text-xs text-foreground">{liveVersion.id}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Draft version</p>
              <p className="font-mono text-xs text-foreground">{draftVersion!.id}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Diff result</p>
              <p className="text-xs font-medium text-foreground">
                {anyChanged ? `${[titleChanged, metaChanged, jsonChanged].filter(Boolean).length} field(s) changed` : "No changes — identical to live"}
              </p>
            </div>
          </div>
          <DiffRow
            label="Title"
            liveValue={liveVersion.title}
            draftValue={draftVersion!.title}
          />
          <DiffRow
            label="Meta description"
            liveValue={liveVersion.metaDescription}
            draftValue={draftVersion!.metaDescription}
          />
          <DiffRow
            label="Content JSON"
            liveValue={jsonLive}
            draftValue={jsonDraft}
          />
          {!anyChanged && (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              Draft is identical to the live version. No changes to apply.
            </p>
          )}
          {anyChanged && (
            <p className="pt-2 text-center text-sm text-amber-700">
              Draft has changes. Apply it from the workflow panel to push them live.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function VersionHistorySection({ versions }: { versions: VersionRecord[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight">Version history</h2>
        <p className="mt-1 text-sm text-muted-foreground">All persisted versions, newest first.</p>
      </div>
      {versions.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No versions yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Create or apply a draft to record a version.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-secondary/60">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">ID</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">State</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Title</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Hash</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created by</th>
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {versions.map((v) => (
                <tr key={v.id}>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{v.id}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        v.contentState === "DRAFT"
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : v.contentState === "LIVE"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border bg-secondary text-foreground"
                      }`}
                    >
                      {v.contentState}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{v.contentSource}</td>
                  <td className="px-5 py-3 text-foreground">{v.title ?? <span className="italic text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{v.contentHash ? v.contentHash.slice(0, 8) + "…" : "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{v.createdBy ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </section>
  );
}

function DetailRow({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate font-mono text-sm text-foreground" : "text-sm text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

// ─── Recommendation draft panel ───────────────────────────────────────────────

type RecoDraftJson = {
  source: "recommendation-generation";
  mode: string;
  basedOnPageVersionId: string;
  linkedRecommendationIds: string[];
  draftPlan: {
    summary: string;
    sectionsToAdd: string[];
    sectionsToImprove: string[];
    trustSignalsToAdd: string[];
    faqOpportunity: string | null;
    internalLinkOpportunity: string | null;
    freshnessOpportunity: string | null;
  };
  editableContent: {
    proposedTitle: string | null;
    proposedMetaDescription: string | null;
    proposedAnswerBlock: string | null;
    proposedSectionOutline: string[];
    proposedFaqItems: Array<{ q: string; a: string }>;
    proposedTrustSignals: string[];
    proposedNotes: string[];
  };
};

function parseRecoDraftJson(value: unknown): RecoDraftJson | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).source === "recommendation-generation"
  ) {
    return value as RecoDraftJson;
  }
  return null;
}

function RecoPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function RecommendationDraftPanel({ draft }: { draft: VersionRecord }) {
  const data = parseRecoDraftJson(draft.extractedJson);
  if (!data) return null;

  const { draftPlan, editableContent } = data;
  const linkedCount = data.linkedRecommendationIds.length;
  const modeLabel =
    data.mode === "rewrite"
      ? "Rewrite"
      : data.mode === "implementation_prep"
        ? "Implementation Prep"
        : "Structured Enhancement";

  const hasOutline = editableContent.proposedSectionOutline.length > 0;
  const hasFaqs = editableContent.proposedFaqItems.length > 0;
  const hasTrustSignals = editableContent.proposedTrustSignals.length > 0;
  const hasNotes = editableContent.proposedNotes.length > 0;
  const hasSectionsToAdd = draftPlan.sectionsToAdd.length > 0;
  const hasSectionsToImprove = draftPlan.sectionsToImprove.length > 0;
  const hasOpportunities =
    draftPlan.faqOpportunity ||
    draftPlan.internalLinkOpportunity ||
    draftPlan.freshnessOpportunity;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Latest recommendation draft plan
            </h2>
            <p className="text-sm text-muted-foreground">
              Generated {formatDate(draft.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RecoPill>{modeLabel}</RecoPill>
            <RecoPill>
              {linkedCount} rec{linkedCount !== 1 ? "s" : ""} linked
            </RecoPill>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-5">
        {/* Summary */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            Plan summary
          </p>
          <p className="mt-1 text-sm text-blue-700">{draftPlan.summary}</p>
        </div>

        {/* Proposed title / meta */}
        {(editableContent.proposedTitle || editableContent.proposedMetaDescription) && (
          <div className="space-y-3">
            {editableContent.proposedTitle && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Proposed title
                </p>
                <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
                  {editableContent.proposedTitle}
                </p>
              </div>
            )}
            {editableContent.proposedMetaDescription && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Proposed meta description
                </p>
                <p className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground">
                  {editableContent.proposedMetaDescription}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Answer block */}
        {editableContent.proposedAnswerBlock && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed answer block
            </p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-amber-900">
                {editableContent.proposedAnswerBlock}
              </p>
            </div>
          </div>
        )}

        {/* Sections */}
        {(hasSectionsToAdd || hasSectionsToImprove) && (
          <div className="grid gap-4 md:grid-cols-2">
            {hasSectionsToAdd && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sections to add
                </p>
                <ul className="space-y-1.5">
                  {draftPlan.sectionsToAdd.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="mt-0.5 shrink-0 font-semibold text-emerald-600">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasSectionsToImprove && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Sections to improve
                </p>
                <ul className="space-y-1.5">
                  {draftPlan.sectionsToImprove.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="mt-0.5 shrink-0 font-semibold text-amber-600">↑</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Section outline */}
        {hasOutline && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Section outline
            </p>
            <ol className="space-y-1.5">
              {editableContent.proposedSectionOutline.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {i + 1}.
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Trust signals */}
        {(hasTrustSignals || draftPlan.trustSignalsToAdd.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trust signals to add
            </p>
            <ul className="space-y-1.5">
              {[...draftPlan.trustSignalsToAdd, ...editableContent.proposedTrustSignals]
                .filter((s, i, arr) => arr.indexOf(s) === i)
                .map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="mt-0.5 shrink-0 text-blue-600">✓</span>
                    {s}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Opportunities */}
        {hasOpportunities && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Identified opportunities
            </p>
            <div className="space-y-2">
              {draftPlan.faqOpportunity && (
                <div className="rounded-xl border border-border bg-secondary/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">FAQ</p>
                  <p className="mt-1 text-sm text-foreground">{draftPlan.faqOpportunity}</p>
                </div>
              )}
              {draftPlan.internalLinkOpportunity && (
                <div className="rounded-xl border border-border bg-secondary/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Internal links</p>
                  <p className="mt-1 text-sm text-foreground">
                    {draftPlan.internalLinkOpportunity}
                  </p>
                </div>
              )}
              {draftPlan.freshnessOpportunity && (
                <div className="rounded-xl border border-border bg-secondary/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Freshness</p>
                  <p className="mt-1 text-sm text-foreground">
                    {draftPlan.freshnessOpportunity}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FAQ items */}
        {hasFaqs && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed FAQ items
            </p>
            <div className="space-y-2">
              {editableContent.proposedFaqItems.map((item, i) => (
                <div key={i} className="rounded-xl border border-border p-4">
                  <p className="text-sm font-medium text-foreground">{item.q}</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Implementation notes */}
        {hasNotes && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Implementation notes
            </p>
            <ul className="space-y-1.5">
              {editableContent.proposedNotes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 shrink-0">•</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Truth note */}
        <p className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          This is a draft plan — not published content. Use the workflow panel above to apply
          the draft and push changes live. Recommendations are marked as linked, not resolved.
        </p>

        {/* Advanced raw view */}
        <details className="rounded-xl border border-border bg-secondary/30 p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Raw draft JSON
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </section>
  );
}
