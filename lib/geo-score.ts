import { EntitySignalType, FindingType, Prisma, type Page, type PageVersion } from "@prisma/client";
import type { PageExtract } from "./extract-page";

type EntitySignalLike = {
  signalType: EntitySignalType;
  visibilityScore: Prisma.Decimal | number | string | null;
  entity: {
    name: string;
    canonicalName: string | null;
  };
};

type ScoreOutput = {
  scores: {
    overallScore: number;
    answerClarityScore: number;
    topicalSpecificityScore: number;
    authorityTrustScore: number;
    expertVisibilityScore: number;
    extractabilityScore: number;
    internalLinkingScore: number;
    snippetUniquenessScore: number;
    conversionClarityScore: number;
    entityConsistencyScore: number;
    updateReadinessScore: number;
    confidence: number;
    severity: number;
    blockersCount: number;
    reasonCodesJson: string[];
  };
  findings: Array<{
    findingType: FindingType;
    code: string;
    title: string;
    severity: number;
    evidenceJson: Record<string, unknown>;
    explanation: string;
  }>;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number): number {
  return Number(clamp(value).toFixed(2));
}

function pts(value: number, threshold: number, points: number): number {
  return value >= threshold ? points : 0;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return value;
}

function normalizeEntityName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function buildGeoScore(
  page: Page,
  pageVersion: PageVersion,
  extract: PageExtract,
  entitySignals: EntitySignalLike[] = []
): ScoreOutput {
  const findings: ScoreOutput["findings"] = [];
  const reasonCodes: string[] = [];

  const {
    title,
    metaDescription,
    canonicalHref,
    robotsMetaContent,
    ogTitle,
    ogDescription,
    hasJsonLd,
    schemaTypeHints,
    indexabilityHint,
    canonicalMatchesPage,
    listCount,
    tableCount,
    hasFaqSchema,
    hasArticleSchema,
    hasOrganizationSchema,
    hasPersonSchema,
    h1Count,
    headingCount,
    paragraphCount,
    internalLinkCount,
    externalLinkCount,
    textLength,
    hasFaqSection,
    hasAuthorOrReviewer,
    hasDateOrUpdate,
  } = extract;

  const canonicalUrl = (page.canonicalUrl ?? "").trim();
  const pageType = (page.pageType ?? "").trim();

  const authoritySignalTypes = new Set<EntitySignalType>([
    EntitySignalType.AUTHOR,
    EntitySignalType.REVIEWER,
    EntitySignalType.CREDENTIAL,
    EntitySignalType.INSTITUTION,
  ]);
  const authorReviewerSignalTypes = new Set<EntitySignalType>([
    EntitySignalType.AUTHOR,
    EntitySignalType.REVIEWER,
  ]);
  const credentialInstitutionSignalTypes = new Set<EntitySignalType>([
    EntitySignalType.CREDENTIAL,
    EntitySignalType.INSTITUTION,
  ]);

  const authoritySignals = entitySignals.filter((signal) => authoritySignalTypes.has(signal.signalType));
  const authorReviewerSignals = entitySignals.filter((signal) => authorReviewerSignalTypes.has(signal.signalType));
  const credentialInstitutionSignals = entitySignals.filter((signal) => credentialInstitutionSignalTypes.has(signal.signalType));

  const strongAuthorReviewerSignals = authorReviewerSignals.filter((signal) => toNumber(signal.visibilityScore) >= 7);
  const strongCredentialInstitutionSignals = credentialInstitutionSignals.filter((signal) => toNumber(signal.visibilityScore) >= 5);
  const weakAuthoritySignals = authoritySignals.filter((signal) => toNumber(signal.visibilityScore) < 4);

  const canonicalNames = new Set(
    authoritySignals
      .map((signal) => normalizeEntityName(signal.entity.canonicalName || signal.entity.name))
      .filter(Boolean),
  );
  const hasEntityConflict = canonicalNames.size > 1;
  const hasAuthoritySchemaHint = hasOrganizationSchema || hasPersonSchema;
  const hasFaqLikeStructure = hasFaqSection || hasFaqSchema || listCount >= 2;
  const weakStructuredCompleteness = !hasJsonLd && listCount === 0 && tableCount === 0 && headingCount < 3;

  if (page.isIndexable === false) {
    reasonCodes.push("page_not_indexable");
    findings.push({
      findingType: FindingType.BLOCKER,
      code: "NOT_INDEXABLE",
      title: "Page is not indexable",
      severity: 95,
      evidenceJson: { pageId: page.id, isIndexable: page.isIndexable },
      explanation: "The page is marked as not indexable in the database.",
    });
  }

  if (!title) {
    reasonCodes.push("missing_title");
    findings.push({
      findingType: FindingType.BLOCKER,
      code: "MISSING_TITLE",
      title: "Missing <title> tag",
      severity: 90,
      evidenceJson: { pageId: page.id, pageVersionId: pageVersion.id, fetchedUrl: extract.finalUrl },
      explanation: "No <title> tag was found in the fetched page HTML.",
    });
  }

  if (h1Count === 0) {
    reasonCodes.push("missing_h1");
    findings.push({
      findingType: FindingType.BLOCKER,
      code: "MISSING_H1",
      title: "Missing H1 heading",
      severity: 85,
      evidenceJson: { pageId: page.id, h1Count },
      explanation: "No <h1> tag was found in the fetched page HTML.",
    });
  }

  if (h1Count > 1) {
    reasonCodes.push("multiple_h1");
    findings.push({
      findingType: FindingType.WARNING,
      code: "MULTIPLE_H1",
      title: "Multiple H1 headings",
      severity: 60,
      evidenceJson: { h1Count },
      explanation: `Found ${h1Count} <h1> tags. A page should have exactly one.`,
    });
  }

  if (!metaDescription) {
    reasonCodes.push("missing_meta_description");
    findings.push({
      findingType: FindingType.WARNING,
      code: "MISSING_META_DESCRIPTION",
      title: "Missing meta description",
      severity: 55,
      evidenceJson: { pageId: page.id, pageVersionId: pageVersion.id },
      explanation: "No meta description was found in the fetched page HTML.",
    });
  }

  if (!canonicalHref) {
    reasonCodes.push("missing_canonical_tag");
    findings.push({
      findingType: FindingType.WARNING,
      code: "MISSING_CANONICAL",
      title: "Missing canonical link",
      severity: 58,
      evidenceJson: { pageId: page.id, fetchedUrl: extract.finalUrl },
      explanation: "No rel=canonical link was found in the page HTML.",
    });
  } else if (canonicalMatchesPage === false) {
    reasonCodes.push("canonical_mismatch");
    findings.push({
      findingType: FindingType.WARNING,
      code: "CANONICAL_MISMATCH",
      title: "Canonical points to a different page",
      severity: 72,
      evidenceJson: {
        pageId: page.id,
        fetchedUrl: extract.finalUrl,
        canonicalHref,
        pageCanonicalUrl: canonicalUrl || null,
      },
      explanation: "The rel=canonical value does not match the scanned page URL identity.",
    });
  }

  if (indexabilityHint === "noindex") {
    reasonCodes.push("noindex_detected");
    findings.push({
      findingType: FindingType.BLOCKER,
      code: "NOINDEX_DETECTED",
      title: "Noindex directive detected",
      severity: 92,
      evidenceJson: {
        pageId: page.id,
        robotsMetaContent,
      },
      explanation: "The robots meta tag includes a noindex directive, which blocks search visibility.",
    });
  } else if (indexabilityHint === "unknown") {
    reasonCodes.push("unclear_indexability");
    findings.push({
      findingType: FindingType.WARNING,
      code: "UNCLEAR_INDEXABILITY",
      title: "Indexability is unclear",
      severity: 44,
      evidenceJson: {
        pageId: page.id,
        robotsMetaContent: robotsMetaContent || null,
      },
      explanation: "No clear indexability signal was found in the robots meta tag.",
    });
  }

  if (!hasJsonLd) {
    reasonCodes.push("missing_structured_data");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "MISSING_STRUCTURED_DATA",
      title: "Missing structured data",
      severity: 52,
      evidenceJson: { pageId: page.id, schemaTypeHints },
      explanation: "No JSON-LD structured data was detected in the page HTML.",
    });
  }

  if (hasFaqSection && !hasFaqSchema) {
    reasonCodes.push("missing_faq_schema");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "MISSING_FAQ_STRUCTURE",
      title: "FAQ structure is incomplete",
      severity: 48,
      evidenceJson: {
        pageId: page.id,
        hasFaqSection,
        hasFaqSchema,
        listCount,
      },
      explanation: "The page appears to contain FAQ content but lacks FAQPage-style structure hints.",
    });
  }

  if (weakStructuredCompleteness) {
    reasonCodes.push("weak_structured_completeness");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "WEAK_STRUCTURED_COMPLETENESS",
      title: "Weak structured completeness",
      severity: 43,
      evidenceJson: {
        pageId: page.id,
        hasJsonLd,
        listCount,
        tableCount,
        headingCount,
      },
      explanation: "The page has limited structural signals for AI extraction and answer framing.",
    });
  }

  if (!hasAuthoritySchemaHint) {
    reasonCodes.push("missing_authority_schema_hint");
    findings.push({
      findingType: FindingType.AUTHORITY_GAP,
      code: "MISSING_AUTHORITY_SCHEMA_HINT",
      title: "Missing authority schema hints",
      severity: 42,
      evidenceJson: {
        pageId: page.id,
        schemaTypeHints,
      },
      explanation: "No Organization or Person schema hint was detected in the page structured data.",
    });
  }

  if (textLength < 300) {
    reasonCodes.push("thin_content");
    findings.push({
      findingType: FindingType.WARNING,
      code: "THIN_CONTENT",
      title: "Thin content",
      severity: 65,
      evidenceJson: { textLength },
      explanation: `Page text is only ${textLength} characters. Minimum recommended is 300.`,
    });
  }

  if (paragraphCount < 2) {
    reasonCodes.push("low_paragraph_count");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "LOW_PARAGRAPH_COUNT",
      title: "Very few paragraphs",
      severity: 50,
      evidenceJson: { paragraphCount },
      explanation: `Only ${paragraphCount} paragraph tag(s) found. Content may not be extractable by AI systems.`,
    });
  }

  // Weak heading structure: has an H1 but very few sub-headings
  if (h1Count >= 1 && headingCount < 2) {
    reasonCodes.push("weak_heading_structure");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "WEAK_HEADING_STRUCTURE",
      title: "Weak heading structure",
      severity: 45,
      evidenceJson: { h1Count, headingCount, textLength },
      explanation: `Page has an H1 but only ${headingCount} heading(s) total. Add subheadings to improve content structure and answer extractability.`,
    });
  }

  // Weak answer structure: enough text but poorly segmented for answer extraction
  if (paragraphCount >= 2 && paragraphCount < 4 && textLength > 500) {
    reasonCodes.push("weak_answer_structure");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "WEAK_ANSWER_STRUCTURE",
      title: "Weak answer structure",
      severity: 42,
      evidenceJson: { paragraphCount, textLength },
      explanation: `Page has ${paragraphCount} paragraphs across ${textLength} characters. Break content into more sections with a clear direct answer near the top.`,
    });
  }

  // FAQ opportunity: substantial content without a FAQ-like section
  if (!hasFaqSection && !hasFaqSchema && textLength > 800 && paragraphCount >= 4) {
    reasonCodes.push("faq_opportunity");
    findings.push({
      findingType: FindingType.EXTRACTABILITY_GAP,
      code: "FAQ_OPPORTUNITY",
      title: "FAQ section opportunity",
      severity: 38,
      evidenceJson: { hasFaqSection, hasFaqSchema, textLength, paragraphCount },
      explanation: "Page has enough content depth to benefit from a FAQ or Q&A section, which improves answer coverage for AI-generated responses.",
    });
  }

  if (!canonicalUrl) {
    reasonCodes.push("missing_canonical_url");
    findings.push({
      findingType: FindingType.WARNING,
      code: "MISSING_CANONICAL_URL",
      title: "Missing canonical URL",
      severity: 45,
      evidenceJson: { pageId: page.id },
      explanation: "The page record has no canonical URL set.",
    });
  }

  if (!pageType) {
    reasonCodes.push("missing_page_type");
    findings.push({
      findingType: FindingType.WARNING,
      code: "MISSING_PAGE_TYPE",
      title: "Missing page type",
      severity: 40,
      evidenceJson: { pageId: page.id },
      explanation: "The page has no page type classification. Set it to improve scoring accuracy.",
    });
  }

  if (!hasAuthorOrReviewer) {
    reasonCodes.push("no_author_signal");
    findings.push({
      findingType: FindingType.AUTHORITY_GAP,
      code: "NO_AUTHOR_SIGNAL",
      title: "No author or reviewer signal",
      severity: 50,
      evidenceJson: { pageId: page.id },
      explanation: "No author, reviewer, or byline was detected in the fetched page HTML.",
    });
  }

  if (!hasDateOrUpdate) {
    reasonCodes.push("no_date_signal");
    findings.push({
      findingType: FindingType.FRESHNESS_GAP,
      code: "NO_DATE_SIGNAL",
      title: "No publish or update date",
      severity: 45,
      evidenceJson: { pageId: page.id },
      explanation: "No publication date, update date, or <time> tag was detected in the HTML.",
    });
  }

  if (internalLinkCount < 2) {
    reasonCodes.push("low_internal_links");
    findings.push({
      findingType: FindingType.LINK_GAP,
      code: "LOW_INTERNAL_LINKS",
      title: "Low internal link count",
      severity: 40,
      evidenceJson: { internalLinkCount },
      explanation: `Only ${internalLinkCount} internal link(s) found. Pages need internal links to pass authority.`,
    });
  }

  if (authorReviewerSignals.length === 0) {
    reasonCodes.push("missing_author_reviewer_signal");
    findings.push({
      findingType: FindingType.AUTHORITY_GAP,
      code: "MISSING_AUTHOR_REVIEWER_SIGNAL",
      title: "Missing author or reviewer entity signal",
      severity: 60,
      evidenceJson: {
        pageId: page.id,
        pageVersionId: pageVersion.id,
        entitySignalCount: entitySignals.length,
      },
      explanation: "No AUTHOR or REVIEWER entity signal is linked to this page version.",
    });
  }

  if (credentialInstitutionSignals.length === 0) {
    reasonCodes.push("missing_authority_evidence_signal");
    findings.push({
      findingType: FindingType.AUTHORITY_GAP,
      code: "NO_AUTHORITY_EVIDENCE_ON_PAGE",
      title: "No authority evidence signal on page",
      severity: 65,
      evidenceJson: {
        pageId: page.id,
        pageVersionId: pageVersion.id,
        authoritySignals: authoritySignals.map((signal) => signal.signalType),
      },
      explanation: "No CREDENTIAL or INSTITUTION entity signal is linked to this page version.",
    });
  } else if (strongCredentialInstitutionSignals.length === 0) {
    reasonCodes.push("weak_credential_institution_signal");
    findings.push({
      findingType: FindingType.AUTHORITY_GAP,
      code: "WEAK_CREDENTIAL_INSTITUTION_SIGNAL",
      title: "Weak credential or institution signal",
      severity: 50,
      evidenceJson: {
        pageId: page.id,
        pageVersionId: pageVersion.id,
        signals: credentialInstitutionSignals.map((signal) => ({
          signalType: signal.signalType,
          visibilityScore: toNumber(signal.visibilityScore),
          entityName: signal.entity.name,
        })),
      },
      explanation: "Credential or institution signals exist, but their visibility is still weak.",
    });
  }

  if (hasEntityConflict || weakAuthoritySignals.length > 0) {
    reasonCodes.push("inconsistent_entity_coverage");
    findings.push({
      findingType: FindingType.ENTITY_GAP,
      code: "INCONSISTENT_ENTITY_COVERAGE",
      title: "Inconsistent entity coverage",
      severity: hasEntityConflict ? 58 : 46,
      evidenceJson: {
        pageId: page.id,
        pageVersionId: pageVersion.id,
        canonicalNames: Array.from(canonicalNames),
        weakSignals: weakAuthoritySignals.map((signal) => ({
          signalType: signal.signalType,
          visibilityScore: toNumber(signal.visibilityScore),
          entityName: signal.entity.name,
          canonicalName: signal.entity.canonicalName,
        })),
      },
      explanation: hasEntityConflict
        ? "Authority-style entity signals point to conflicting names or identities."
        : "Authority entity signals are present but still weak or incomplete.",
    });
  }

  const titleLen = title.length;
  const titleInRange = titleLen >= 30 && titleLen <= 70;

  const answerClarityScore = round(
    18 +
      pts(h1Count, 1, 14) +
      pts(paragraphCount, 3, 10) +
      pts(paragraphCount, 8, 8) +
      pts(textLength, 500, 8) +
      pts(textLength, 2000, 8) +
      (hasFaqLikeStructure ? 12 : 0) +
      (metaDescription ? 10 : 0) +
      (ogTitle ? 5 : 0) +
      pts(listCount, 1, 5) +
      pts(tableCount, 1, 4) -
      // Content structure penalties
      (headingCount < 2 && textLength > 600 ? 6 : 0) -
      (paragraphCount >= 2 && paragraphCount < 4 && textLength > 500 ? 4 : 0) -
      (canonicalMatchesPage === false ? 6 : 0) -
      (indexabilityHint === "noindex" ? 12 : 0),
  );

  const topicalSpecificityScore = round(
    20 +
      (title ? 10 : 0) +
      (titleInRange ? 15 : 0) +
      (pageType ? 12 : 0) +
      pts(headingCount, 3, 10) +
      pts(headingCount, 6, 8) +
      pts(h1Count, 1, 10) +
      pts(textLength, 1000, 8) +
      (metaDescription ? 7 : 0),
  );

  const authorityTrustScore = round(
    16 +
      (hasAuthorOrReviewer ? 14 : 0) +
      (hasDateOrUpdate ? 10 : 0) +
      (canonicalHref ? 8 : 0) +
      (canonicalMatchesPage ? 6 : 0) +
      (hasAuthoritySchemaHint ? 10 : 0) +
      (hasJsonLd ? 5 : 0) +
      (page.existsLive ? 6 : 0) +
      (page.routeLastVerifiedAt ? 8 : 0) +
      pts(externalLinkCount, 1, 5) +
      pts(internalLinkCount, 3, 6) +
      pts(strongCredentialInstitutionSignals.length, 1, 12) +
      pts(credentialInstitutionSignals.length, 1, 8) +
      pts(authoritySignals.length, 3, 6) -
      (credentialInstitutionSignals.length === 0 ? 16 : 0) -
      (hasEntityConflict ? 8 : 0) -
      (canonicalMatchesPage === false ? 12 : 0) -
      (indexabilityHint === "noindex" ? 18 : 0) -
      (!hasAuthoritySchemaHint ? 8 : 0),
  );

  const expertVisibilityScore = round(
    15 +
      (hasAuthorOrReviewer ? 16 : 0) +
      (metaDescription ? 10 : 0) +
      (title ? 10 : 0) +
      (hasDateOrUpdate ? 8 : 0) +
      pts(paragraphCount, 5, 10) +
      pts(textLength, 1000, 10) +
      pts(strongAuthorReviewerSignals.length, 1, 18) +
      pts(authorReviewerSignals.length, 1, 8) -
      (authorReviewerSignals.length === 0 ? 20 : 0),
  );

  const extractabilityScore = round(
    14 +
      pts(paragraphCount, 3, 12) +
      pts(paragraphCount, 5, 5) +
      pts(headingCount, 2, 12) +
      pts(textLength, 500, 8) +
      pts(textLength, 2000, 8) +
      (hasFaqLikeStructure ? 12 : 0) +
      pts(listCount, 1, 8) +
      pts(tableCount, 1, 8) +
      (hasJsonLd ? 10 : 0) +
      (hasFaqSchema ? 8 : 0) +
      (hasArticleSchema ? 6 : 0) +
      (metaDescription ? 6 : 0) +
      (canonicalHref ? 6 : 0) -
      // FAQ opportunity missed: substantial content but no FAQ-like section
      (!hasFaqSection && !hasFaqSchema && textLength > 800 && paragraphCount >= 4 ? 5 : 0) -
      (canonicalMatchesPage === false ? 12 : 0) -
      (indexabilityHint === "noindex" ? 16 : 0),
  );

  const internalLinkingScore = round(
    15 +
      pts(internalLinkCount, 1, 10) +
      pts(internalLinkCount, 3, 12) +
      pts(internalLinkCount, 5, 12) +
      pts(internalLinkCount, 10, 10) +
      pts(internalLinkCount, 20, 10) +
      (canonicalHref ? 8 : 0) +
      pts(headingCount, 2, 11),
  );

  const snippetUniquenessScore = round(
    15 +
      (hasFaqLikeStructure ? 18 : 0) +
      (hasFaqSection ? 5 : 0) +
      pts(h1Count, 1, 12) +
      (metaDescription ? 12 : 0) +
      pts(textLength, 300, 10) +
      pts(textLength, 1500, 10) +
      pts(headingCount, 3, 8) +
      (titleInRange ? 13 : 0),
  );

  const conversionClarityScore = round(
    20 +
      (pageType ? 20 : 0) +
      (metaDescription ? 15 : 0) +
      (title ? 12 : 0) +
      pts(paragraphCount, 3, 10) +
      pts(h1Count, 1, 10) +
      (hasFaqLikeStructure ? 5 : 0) +
      (canonicalHref ? 8 : 0),
  );

  const entityConsistencyScore = round(
    16 +
      pts(authoritySignals.length, 1, 10) +
      pts(authoritySignals.length, 3, 8) +
      (strongAuthorReviewerSignals.length > 0 ? 12 : 0) +
      (strongCredentialInstitutionSignals.length > 0 ? 12 : 0) +
      (canonicalMatchesPage ? 8 : 0) +
      (hasOrganizationSchema || hasPersonSchema ? 8 : 0) +
      (title ? 8 : 0) +
      (hasDateOrUpdate ? 6 : 0) -
      (hasEntityConflict ? 25 : 0) -
      (weakAuthoritySignals.length > 0 ? 10 : 0) -
      (authoritySignals.length === 0 ? 20 : 0) -
      (canonicalMatchesPage === false ? 8 : 0),
  );

  const updateReadinessScore = round(
    14 +
      (hasDateOrUpdate ? 22 : 0) +
      (hasAuthorOrReviewer ? 6 : 0) +
      (page.routeLastVerifiedAt ? 18 : 0) +
      (page.existsLive ? 12 : 0) +
      (pageVersion.contentHash ? 10 : 0) +
      (hasArticleSchema ? 8 : 0) +
      (metaDescription ? 6 : 0) +
      (canonicalHref ? 5 : 0) +
      pts(paragraphCount, 5, 8) -
      (indexabilityHint === "noindex" ? 10 : 0),
  );

  const scoreValues = [
    answerClarityScore,
    topicalSpecificityScore,
    authorityTrustScore,
    expertVisibilityScore,
    extractabilityScore,
    internalLinkingScore,
    snippetUniquenessScore,
    conversionClarityScore,
    entityConsistencyScore,
    updateReadinessScore,
  ];

  const overallScore = round(scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length);
  const blockersCount = findings.filter((finding) => finding.findingType === FindingType.BLOCKER).length;
  const severity = findings.length > 0 ? Math.max(...findings.map((finding) => finding.severity)) : 10;
  const confidence = round(
    30 +
      (title ? 12 : 0) +
      (metaDescription ? 10 : 0) +
      (canonicalHref ? 8 : 0) +
      (hasJsonLd ? 8 : 0) +
      pts(textLength, 300, 10) +
      pts(paragraphCount, 3, 10) +
      pts(headingCount, 2, 8) +
      pts(listCount, 1, 4) +
      (page.routeLastVerifiedAt ? 10 : 0) +
      pts(internalLinkCount, 1, 8) +
      pts(entitySignals.length, 1, 8),
  );

  if (findings.length === 0) {
    reasonCodes.push("all_signals_healthy");
    findings.push({
      findingType: FindingType.STRENGTH,
      code: "ALL_SIGNALS_HEALTHY",
      title: "All baseline signals present",
      severity: 10,
      evidenceJson: {
        pageId: page.id,
        pageVersionId: pageVersion.id,
        title,
        h1Count,
        paragraphCount,
        textLength,
        internalLinkCount,
        entitySignalCount: entitySignals.length,
        hasJsonLd,
        schemaTypeHints,
      },
      explanation: "The fetched page passed baseline content, authority, and technical extraction checks with usable entity coverage.",
    });
  }

  return {
    scores: {
      overallScore,
      answerClarityScore,
      topicalSpecificityScore,
      authorityTrustScore,
      expertVisibilityScore,
      extractabilityScore,
      internalLinkingScore,
      snippetUniquenessScore,
      conversionClarityScore,
      entityConsistencyScore,
      updateReadinessScore,
      confidence,
      severity,
      blockersCount,
      reasonCodesJson: reasonCodes,
    },
    findings,
  };
}
