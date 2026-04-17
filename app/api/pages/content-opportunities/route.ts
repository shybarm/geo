import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// ─── Signal parser ────────────────────────────────────────────────────────────

type ContentSignals = {
  h1Count?: number;
  headingCount?: number;
  paragraphCount?: number;
  textLength?: number;
  hasFaqSection?: boolean;
  hasAuthorOrReviewer?: boolean;
  hasDateOrUpdate?: boolean;
};

function parseSig(raw: unknown): ContentSignals {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ContentSignals;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  if (v && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  return null;
}

// ─── Gap detectors ────────────────────────────────────────────────────────────

function isMissingDirectAnswer(s: ContentSignals, answerClarityScore: number | null): boolean {
  const paragraphs = s.paragraphCount ?? 0;
  const headings = s.headingCount ?? 0;
  const text = s.textLength ?? 0;
  return (
    paragraphs < 2 ||
    (answerClarityScore !== null && answerClarityScore < 40 && headings < 2) ||
    (text > 500 && paragraphs < 3 && headings < 2)
  );
}

function isWeakHeadingStructure(s: ContentSignals): boolean {
  const h1 = s.h1Count ?? 0;
  const headings = s.headingCount ?? 0;
  const text = s.textLength ?? 0;
  return h1 === 0 || headings < 2 || (text > 1000 && headings < 3);
}

function needsFaqSection(s: ContentSignals): boolean {
  const text = s.textLength ?? 0;
  const paragraphs = s.paragraphCount ?? 0;
  return s.hasFaqSection !== true && text > 800 && paragraphs >= 4;
}

function isThinOrLowClarity(
  s: ContentSignals,
  clarityScore: number | null,
  extractScore: number | null,
): boolean {
  const text = s.textLength ?? 0;
  const paragraphs = s.paragraphCount ?? 0;
  return (
    text < 300 ||
    paragraphs < 2 ||
    (clarityScore !== null && clarityScore < 35) ||
    (extractScore !== null && extractScore < 35)
  );
}

function isMissingEvidenceSignals(s: ContentSignals): boolean {
  return s.hasAuthorOrReviewer !== true && s.hasDateOrUpdate !== true;
}

// ─── Gap explanations ─────────────────────────────────────────────────────────

function contentGapExplanations(
  s: ContentSignals,
  answerClarityScore: number | null,
  extractabilityScore: number | null,
): string[] {
  const reasons: string[] = [];
  if (isMissingDirectAnswer(s, answerClarityScore)) {
    const paragraphs = s.paragraphCount ?? 0;
    const headings = s.headingCount ?? 0;
    reasons.push(
      paragraphs < 2
        ? "Very few paragraphs detected — content may not be answer-ready near the top."
        : headings < 2
          ? "Low heading count reduces answer extractability for AI systems."
          : "Content structure suggests a weak or buried direct answer.",
    );
  }
  if (isWeakHeadingStructure(s)) {
    const h1 = s.h1Count ?? 0;
    const headings = s.headingCount ?? 0;
    reasons.push(
      h1 === 0
        ? "No H1 heading detected — page is missing a primary topic signal."
        : headings < 2
          ? "Only one heading detected — content lacks section structure."
          : "Long content with too few headings to support structured extraction.",
    );
  }
  if (needsFaqSection(s)) {
    reasons.push(
      "Substantial content detected but no FAQ-like section found — a Q&A block would improve answer coverage.",
    );
  }
  if (isThinOrLowClarity(s, answerClarityScore, extractabilityScore)) {
    const text = s.textLength ?? 0;
    reasons.push(
      text < 300
        ? `Only ${text} characters of text — page is too thin to answer meaningful queries.`
        : "Low paragraph count or low clarity score — content may not be extractable.",
    );
  }
  if (isMissingEvidenceSignals(s)) {
    reasons.push(
      "No author, reviewer, publication date, or update date signals detected — page lacks evidence of freshness and credibility.",
    );
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
  latestSuccessfulScoreSnapshot: {
    overallScore: unknown;
    answerClarityScore: unknown;
    extractabilityScore: unknown;
  } | null;
  currentLivePageVersion: { extractedJson: unknown } | null;
}) {
  const s = parseSig(page.currentLivePageVersion?.extractedJson ?? null);
  const snap = page.latestSuccessfulScoreSnapshot;
  const clarityScore = toNum(snap?.answerClarityScore);
  const extractScore = toNum(snap?.extractabilityScore);
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    pageType: page.pageType,
    existsLive: page.existsLive,
    updatedAt: page.updatedAt.toISOString(),
    latestOverallScore: toNum(snap?.overallScore),
    answerClarityScore: clarityScore,
    extractabilityScore: extractScore,
    textLength: typeof s.textLength === "number" ? s.textLength : null,
    headingCount: typeof s.headingCount === "number" ? s.headingCount : null,
    h1Count: typeof s.h1Count === "number" ? s.h1Count : null,
    hasFaqSection: typeof s.hasFaqSection === "boolean" ? s.hasFaqSection : null,
    hasAuthorSignal: typeof s.hasAuthorOrReviewer === "boolean" ? s.hasAuthorOrReviewer : null,
    hasDateSignal: typeof s.hasDateOrUpdate === "boolean" ? s.hasDateOrUpdate : null,
    gaps: contentGapExplanations(s, clarityScore, extractScore),
  };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const sp = parseSearchParams(request.url);
    const workspaceId = sp.get("workspaceId")?.trim();
    const siteId = sp.get("siteId")?.trim();
    const pageId = sp.get("pageId")?.trim();

    const pages = await prisma.page.findMany({
      where: {
        existsLive: true,
        currentLivePageVersionId: { not: null },
        ...(workspaceId ? { workspaceId } : {}),
        ...(siteId ? { siteId } : {}),
        ...(pageId ? { id: pageId } : {}),
      },
      select: {
        id: true,
        title: true,
        path: true,
        pageType: true,
        existsLive: true,
        updatedAt: true,
        currentLivePageVersion: { select: { extractedJson: true } },
        latestSuccessfulScoreSnapshot: {
          select: { overallScore: true, answerClarityScore: true, extractabilityScore: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Only pages that have been scanned (have content structure signals)
    const scanned = pages.filter((p) => {
      const s = parseSig(p.currentLivePageVersion?.extractedJson ?? null);
      return typeof s.textLength === "number" || typeof s.paragraphCount === "number";
    });

    const pagesMissingDirectAnswer = scanned
      .filter((p) => {
        const s = parseSig(p.currentLivePageVersion?.extractedJson ?? null);
        const clarity = toNum(p.latestSuccessfulScoreSnapshot?.answerClarityScore);
        return isMissingDirectAnswer(s, clarity);
      })
      .slice(0, 30)
      .map(toItem);

    const pagesWithWeakHeadingStructure = scanned
      .filter((p) =>
        isWeakHeadingStructure(parseSig(p.currentLivePageVersion?.extractedJson ?? null)),
      )
      .slice(0, 30)
      .map(toItem);

    const pagesNeedingFaqSection = scanned
      .filter((p) =>
        needsFaqSection(parseSig(p.currentLivePageVersion?.extractedJson ?? null)),
      )
      .slice(0, 20)
      .map(toItem);

    const thinOrLowClarityPages = scanned
      .filter((p) => {
        const s = parseSig(p.currentLivePageVersion?.extractedJson ?? null);
        const clarity = toNum(p.latestSuccessfulScoreSnapshot?.answerClarityScore);
        const extract = toNum(p.latestSuccessfulScoreSnapshot?.extractabilityScore);
        return isThinOrLowClarity(s, clarity, extract);
      })
      .slice(0, 30)
      .map(toItem);

    const pagesMissingEvidenceSignals = scanned
      .filter((p) =>
        isMissingEvidenceSignals(parseSig(p.currentLivePageVersion?.extractedJson ?? null)),
      )
      .slice(0, 30)
      .map(toItem);

    return successResponse({
      scannedPagesCount: scanned.length,
      pagesMissingDirectAnswerCount: pagesMissingDirectAnswer.length,
      pagesWithWeakHeadingStructureCount: pagesWithWeakHeadingStructure.length,
      pagesNeedingFaqSectionCount: pagesNeedingFaqSection.length,
      thinOrLowClarityPagesCount: thinOrLowClarityPages.length,
      pagesMissingEvidenceSignalsCount: pagesMissingEvidenceSignals.length,
      pagesMissingDirectAnswer,
      pagesWithWeakHeadingStructure,
      pagesNeedingFaqSection,
      thinOrLowClarityPages,
      pagesMissingEvidenceSignals,
    });
  } catch {
    return errorResponse("Failed to fetch content opportunities.", 500);
  }
}
