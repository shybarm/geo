import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// ─── Signal parser ────────────────────────────────────────────────────────────

type SchemaSignals = {
  hasJsonLd?: boolean;
  schemaTypeHints?: string[];
  hasFaqSchema?: boolean;
  hasArticleSchema?: boolean;
  hasOrganizationSchema?: boolean;
  hasPersonSchema?: boolean;
  hasFaqSection?: boolean;
  hasAuthorOrReviewer?: boolean;
  indexabilityHint?: string;
  canonicalMatchesPage?: boolean | null;
  textLength?: number;
  entitySignalCount?: number;
};

function parseSignals(raw: unknown): SchemaSignals {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as SchemaSignals;
}

// ─── Gap detectors ────────────────────────────────────────────────────────────

function hasMissingStructuredData(s: SchemaSignals): boolean {
  return s.hasJsonLd === false;
}

// Present but no meaningful type hints AND none of the specific schema types
function hasWeakSchemaSupport(s: SchemaSignals): boolean {
  if (!s.hasJsonLd) return false; // completely missing handled above
  const hints = s.schemaTypeHints ?? [];
  const hasSpecific =
    s.hasFaqSchema || s.hasArticleSchema || s.hasOrganizationSchema || s.hasPersonSchema;
  return hints.length === 0 || !hasSpecific;
}

function hasFaqSchemaGap(s: SchemaSignals): boolean {
  return s.hasFaqSection === true && s.hasFaqSchema !== true;
}

function hasAuthoritySchemaGap(s: SchemaSignals): boolean {
  return (
    s.hasAuthorOrReviewer === true &&
    s.hasOrganizationSchema !== true &&
    s.hasPersonSchema !== true
  );
}

function hasCanonicalOrIndexabilityRisk(s: SchemaSignals): boolean {
  return s.canonicalMatchesPage === false || s.indexabilityHint === "noindex";
}

// ─── Gap explanations ─────────────────────────────────────────────────────────

function schemaGapExplanation(s: SchemaSignals): string[] {
  const reasons: string[] = [];
  if (hasMissingStructuredData(s)) {
    reasons.push("No JSON-LD or structured data detected on this page.");
  }
  if (hasWeakSchemaSupport(s)) {
    const hints = s.schemaTypeHints ?? [];
    reasons.push(
      hints.length === 0
        ? "JSON-LD is present but no recognised schema types were identified."
        : `Schema types found (${hints.join(", ")}) but none match FAQ, Article, Person, or Organization patterns.`,
    );
  }
  if (hasFaqSchemaGap(s)) {
    reasons.push(
      "FAQ-like content structure detected but no FAQPage schema markup found.",
    );
  }
  if (hasAuthoritySchemaGap(s)) {
    reasons.push(
      "Author or reviewer signals detected but no Person or Organization schema markup found.",
    );
  }
  if (s.canonicalMatchesPage === false) {
    reasons.push("Canonical URL does not match the page URL — may reduce schema authority.");
  }
  if (s.indexabilityHint === "noindex") {
    reasons.push("Page is marked noindex — structured data signals may be ignored by crawlers.");
  }
  return reasons;
}

// ─── Item shape ───────────────────────────────────────────────────────────────

function toItem(page: {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: Date;
  latestSuccessfulScoreSnapshot: { overallScore: unknown } | null;
  currentLivePageVersion: { extractedJson: unknown } | null;
}) {
  const s = parseSignals(page.currentLivePageVersion?.extractedJson ?? null);
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    pageType: page.pageType,
    existsLive: page.existsLive,
    updatedAt: page.updatedAt.toISOString(),
    latestOverallScore:
      page.latestSuccessfulScoreSnapshot?.overallScore != null
        ? Number(page.latestSuccessfulScoreSnapshot.overallScore)
        : null,
    structuredDataPresent: typeof s.hasJsonLd === "boolean" ? s.hasJsonLd : null,
    schemaHints: Array.isArray(s.schemaTypeHints) ? s.schemaTypeHints : [],
    hasFaqSection: typeof s.hasFaqSection === "boolean" ? s.hasFaqSection : null,
    indexabilityHint: typeof s.indexabilityHint === "string" ? s.indexabilityHint : null,
    canonicalMatchesUrl:
      typeof s.canonicalMatchesPage === "boolean" ? s.canonicalMatchesPage : null,
    gaps: schemaGapExplanation(s),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const sp = parseSearchParams(request.url);
    const workspaceId = sp.get("workspaceId")?.trim();
    const siteId = sp.get("siteId")?.trim();

    const pages = await prisma.page.findMany({
      where: {
        existsLive: true,
        currentLivePageVersionId: { not: null },
        ...(workspaceId ? { workspaceId } : {}),
        ...(siteId ? { siteId } : {}),
      },
      select: {
        id: true,
        title: true,
        path: true,
        pageType: true,
        existsLive: true,
        updatedAt: true,
        currentLivePageVersion: { select: { extractedJson: true } },
        latestSuccessfulScoreSnapshot: { select: { overallScore: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Only pages that have been scanned (have real extracted signals)
    const scanned = pages.filter((p) => {
      const s = parseSignals(p.currentLivePageVersion?.extractedJson ?? null);
      return typeof s.hasJsonLd === "boolean"; // populated by scan
    });

    const pagesMissingStructuredData = scanned
      .filter((p) => hasMissingStructuredData(parseSignals(p.currentLivePageVersion?.extractedJson)))
      .slice(0, 30)
      .map(toItem);

    const pagesWithWeakSchemaSupport = scanned
      .filter((p) => hasWeakSchemaSupport(parseSignals(p.currentLivePageVersion?.extractedJson)))
      .slice(0, 30)
      .map(toItem);

    const faqPagesMissingFaqSchema = scanned
      .filter((p) => hasFaqSchemaGap(parseSignals(p.currentLivePageVersion?.extractedJson)))
      .slice(0, 20)
      .map(toItem);

    const authorityPagesMissingAuthoritySchema = scanned
      .filter((p) => hasAuthoritySchemaGap(parseSignals(p.currentLivePageVersion?.extractedJson)))
      .slice(0, 20)
      .map(toItem);

    const pagesWithCanonicalOrIndexabilityRisk = scanned
      .filter((p) =>
        hasCanonicalOrIndexabilityRisk(parseSignals(p.currentLivePageVersion?.extractedJson)),
      )
      .slice(0, 20)
      .map(toItem);

    return successResponse({
      scannedPagesCount: scanned.length,
      pagesMissingStructuredDataCount: pagesMissingStructuredData.length,
      pagesWithWeakSchemaSupportCount: pagesWithWeakSchemaSupport.length,
      faqPagesMissingFaqSchemaCount: faqPagesMissingFaqSchema.length,
      authorityPagesMissingAuthoritySchemaCount: authorityPagesMissingAuthoritySchema.length,
      pagesWithCanonicalOrIndexabilityRiskCount: pagesWithCanonicalOrIndexabilityRisk.length,
      pagesMissingStructuredData,
      pagesWithWeakSchemaSupport,
      faqPagesMissingFaqSchema,
      authorityPagesMissingAuthoritySchema,
      pagesWithCanonicalOrIndexabilityRisk,
    });
  } catch {
    return errorResponse("Failed to fetch schema opportunities.", 500);
  }
}
