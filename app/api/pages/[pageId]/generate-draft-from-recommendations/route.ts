import { PageVersionSource, PageVersionState, RecommendationStatus } from "@prisma/client";

import { createdResponse, errorResponse } from "@/lib/api";
import { createPageVersionHash, toNullableJsonValue } from "@/lib/page-version";
import { prisma } from "@/lib/prisma";
import { writeChangeLog } from "@/lib/write-change-log";

type RouteContext = {
  params: Promise<{ pageId: string }>;
};

type DraftMode = "structured_enhancement" | "rewrite" | "implementation_prep";

const VALID_MODES: DraftMode[] = [
  "structured_enhancement",
  "rewrite",
  "implementation_prep",
];

type RecInput = {
  id: string;
  type: string;
  priority: string;
  title: string;
  description: string | null;
  whyItMatters: string | null;
};

type FindingInput = {
  findingType: string;
  title: string;
  explanation: string | null;
};

function buildDraftContent(
  pageTitle: string | null,
  liveExtractedJson: unknown,
  recs: RecInput[],
  findings: FindingInput[],
  mode: DraftMode,
) {
  const sectionsToAdd: string[] = [];
  const sectionsToImprove: string[] = [];
  const trustSignalsToAdd: string[] = [];
  let faqOpportunity: string | null = null;
  let internalLinkOpportunity: string | null = null;
  let freshnessOpportunity: string | null = null;

  let proposedTitle: string | null = pageTitle ?? null;
  let proposedMetaDescription: string | null = null;
  let proposedAnswerBlock: string | null = null;
  const proposedSectionOutline: string[] = [];
  const proposedFaqItems: Array<{ q: string; a: string }> = [];
  const proposedTrustSignals: string[] = [];
  const proposedNotes: string[] = [];

  const liveSignals =
    liveExtractedJson &&
    typeof liveExtractedJson === "object" &&
    !Array.isArray(liveExtractedJson)
      ? (liveExtractedJson as Record<string, unknown>)
      : null;

  // Process recommendations by type
  for (const rec of recs) {
    switch (rec.type) {
      case "REWRITE_REQUIRED": {
        const lines: string[] = [];
        if (rec.description) lines.push(rec.description);
        if (rec.whyItMatters) lines.push(`Why it matters: ${rec.whyItMatters}`);
        proposedAnswerBlock =
          lines.join("\n\n") ||
          `A full rewrite is required for "${pageTitle ?? "this page"}".`;
        if (mode !== "implementation_prep") {
          proposedSectionOutline.push(
            "Introduction — answer the core query directly in the first paragraph",
          );
          proposedSectionOutline.push(
            "Main body — structured sections with clear H2/H3 headings",
          );
          proposedSectionOutline.push(
            "Evidence and authority — author byline, credentials, or publish date",
          );
          proposedSectionOutline.push("Conclusion / call to action");
        }
        break;
      }
      case "STRUCTURAL_CHANGE": {
        if (rec.description) {
          sectionsToImprove.push(rec.description.slice(0, 200));
        }
        if (rec.title) {
          sectionsToAdd.push(`Based on: ${rec.title}`);
        }
        if (mode === "rewrite" || mode === "structured_enhancement") {
          proposedSectionOutline.push(`Restructure: ${rec.title}`);
        }
        break;
      }
      case "AUTHORITY_PROJECT": {
        if (rec.description) {
          trustSignalsToAdd.push(rec.description.slice(0, 200));
        } else {
          trustSignalsToAdd.push(`Authority improvement needed: ${rec.title}`);
        }
        if (rec.whyItMatters) {
          proposedTrustSignals.push(rec.whyItMatters.slice(0, 200));
        }
        break;
      }
      case "QUICK_WIN": {
        if (mode !== "rewrite") {
          proposedNotes.push(
            `Quick win: ${rec.title}${rec.description ? ` — ${rec.description.slice(0, 150)}` : ""}`,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  // Process findings
  for (const finding of findings) {
    switch (finding.findingType) {
      case "FRESHNESS_GAP": {
        if (!freshnessOpportunity) {
          freshnessOpportunity =
            finding.explanation ?? `Freshness gap: ${finding.title}`;
        }
        proposedNotes.push(
          `Add a publish date or "last updated" signal to address: ${finding.title}`,
        );
        break;
      }
      case "LINK_GAP": {
        if (!internalLinkOpportunity) {
          internalLinkOpportunity =
            finding.explanation ?? `Internal link gap: ${finding.title}`;
        }
        proposedNotes.push(`Add internal links: ${finding.title}`);
        break;
      }
      case "EXTRACTABILITY_GAP": {
        if (!faqOpportunity) {
          faqOpportunity =
            finding.explanation ?? `Extractability gap: ${finding.title}`;
        }
        break;
      }
      case "AUTHORITY_GAP":
      case "ENTITY_GAP": {
        const signal = finding.explanation ?? finding.title;
        if (!proposedTrustSignals.includes(signal)) {
          proposedTrustSignals.push(signal);
        }
        break;
      }
      default:
        break;
    }
  }

  // Live signal-based enhancements
  if (liveSignals) {
    const hasFaqSection = liveSignals.hasFaqSection === true;
    const textLength =
      typeof liveSignals.textLength === "number" ? liveSignals.textLength : 0;
    const paragraphCount =
      typeof liveSignals.paragraphCount === "number"
        ? liveSignals.paragraphCount
        : 0;
    const headingCount =
      typeof liveSignals.headingCount === "number" ? liveSignals.headingCount : 0;
    const h1Count =
      typeof liveSignals.h1Count === "number" ? liveSignals.h1Count : null;
    const hasAuthor = liveSignals.hasAuthorOrReviewer === true;
    const hasDate = liveSignals.hasDateOrUpdate === true;
    const liveMeta =
      typeof liveSignals.metaDescription === "string"
        ? liveSignals.metaDescription
        : null;
    const liveTitle =
      typeof liveSignals.title === "string" ? liveSignals.title : null;

    if (!hasFaqSection && textLength > 800 && paragraphCount >= 4 && !faqOpportunity) {
      faqOpportunity =
        "Substantial content without a FAQ section — a Q&A block would improve answer coverage.";
      proposedFaqItems.push({
        q: "What is this about?",
        a: "[Placeholder: answer derived from page topic]",
      });
      proposedFaqItems.push({
        q: "How does it work?",
        a: "[Placeholder: provide a clear step-by-step answer]",
      });
    }

    if ((textLength < 300 || paragraphCount < 2) && !sectionsToImprove.length) {
      sectionsToImprove.push(
        textLength < 300
          ? `Thin content detected (${textLength} chars) — expand with structured sections`
          : "Very few paragraphs — add more content sections",
      );
    }

    if (h1Count === 0 && !proposedSectionOutline.length) {
      proposedSectionOutline.push(
        "Add an H1 heading that matches the primary query for this page",
      );
    } else if (
      headingCount < 2 &&
      textLength > 1000 &&
      !proposedSectionOutline.length
    ) {
      proposedSectionOutline.push("Add H2/H3 subheadings to segment long content");
    }

    if (!hasAuthor && !hasDate) {
      if (!freshnessOpportunity) {
        freshnessOpportunity =
          "No author, reviewer, or date signal detected — add a byline or publish date.";
      }
      if (!proposedTrustSignals.length) {
        proposedTrustSignals.push(
          "Add an author byline or publication date to establish trust and freshness.",
        );
      }
    }

    if (liveMeta) proposedMetaDescription = liveMeta;
    if (!proposedTitle && liveTitle) proposedTitle = liveTitle;
  }

  // Build summary
  const recTypeLabels = [...new Set(recs.map((r) => r.type))].join(", ");
  const summaryParts: string[] = [
    `${recs.length} recommendation${recs.length !== 1 ? "s" : ""} linked (${recTypeLabels || "none"}).`,
  ];
  if (sectionsToAdd.length)
    summaryParts.push(
      `${sectionsToAdd.length} section${sectionsToAdd.length !== 1 ? "s" : ""} to add.`,
    );
  if (sectionsToImprove.length)
    summaryParts.push(
      `${sectionsToImprove.length} section${sectionsToImprove.length !== 1 ? "s" : ""} to improve.`,
    );
  if (trustSignalsToAdd.length)
    summaryParts.push(
      `${trustSignalsToAdd.length} trust signal${trustSignalsToAdd.length !== 1 ? "s" : ""} to add.`,
    );
  if (faqOpportunity) summaryParts.push("FAQ opportunity identified.");
  if (freshnessOpportunity) summaryParts.push("Freshness opportunity identified.");
  if (internalLinkOpportunity) summaryParts.push("Internal link opportunity identified.");

  return {
    draftPlan: {
      summary: summaryParts.join(" "),
      sectionsToAdd,
      sectionsToImprove,
      trustSignalsToAdd,
      faqOpportunity,
      internalLinkOpportunity,
      freshnessOpportunity,
    },
    editableContent: {
      proposedTitle,
      proposedMetaDescription,
      proposedAnswerBlock,
      proposedSectionOutline,
      proposedFaqItems,
      proposedTrustSignals,
      proposedNotes,
    },
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { pageId } = await context.params;

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { currentLivePageVersion: true },
  });

  if (!page) return errorResponse("Page not found.", 404);
  if (!page.currentLivePageVersionId || !page.currentLivePageVersion) {
    return errorResponse(
      "Page has no current live version. Cannot generate draft.",
      400,
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    recommendationIds?: unknown;
    mode?: unknown;
  };

  const rawMode =
    typeof body.mode === "string" ? body.mode : "structured_enhancement";
  const mode: DraftMode = VALID_MODES.includes(rawMode as DraftMode)
    ? (rawMode as DraftMode)
    : "structured_enhancement";

  // Load OPEN recommendations for the page
  let recommendations = await prisma.recommendation.findMany({
    where: { pageId, status: RecommendationStatus.OPEN },
    orderBy: { createdAt: "desc" },
  });

  // Filter to provided IDs if given
  if (
    Array.isArray(body.recommendationIds) &&
    (body.recommendationIds as unknown[]).length > 0
  ) {
    const ids = (body.recommendationIds as unknown[]).filter(
      (id): id is string => typeof id === "string",
    );
    const filtered = recommendations.filter((r) => ids.includes(r.id));
    const foundIds = new Set(filtered.map((r) => r.id));
    const invalid = ids.filter((id) => !foundIds.has(id));
    if (invalid.length > 0) {
      return errorResponse(
        `Recommendations not found for this page: ${invalid.join(", ")}`,
        400,
      );
    }
    recommendations = filtered;
  }

  if (recommendations.length === 0) {
    return errorResponse(
      "No active (OPEN) recommendations found for this page.",
      400,
    );
  }

  // Load latest scan findings for richer context
  const latestFindings = page.latestSuccessfulScanRunId
    ? await prisma.scanFinding.findMany({
        where: { scanRunId: page.latestSuccessfulScanRunId },
        orderBy: { severity: "desc" },
        take: 20,
        select: { findingType: true, title: true, explanation: true },
      })
    : [];

  const linkedRecommendationIds = recommendations.map((r) => r.id);

  const { draftPlan, editableContent } = buildDraftContent(
    page.title,
    page.currentLivePageVersion.extractedJson,
    recommendations.map((r) => ({
      id: r.id,
      type: r.type as string,
      priority: r.priority as string,
      title: r.title,
      description: r.description,
      whyItMatters: r.whyItMatters,
    })),
    latestFindings.map((f) => ({
      findingType: f.findingType as string,
      title: f.title,
      explanation: f.explanation,
    })),
    mode,
  );

  const draftExtractedJson = {
    source: "recommendation-generation",
    mode,
    basedOnPageVersionId: page.currentLivePageVersionId,
    linkedRecommendationIds,
    draftPlan,
    editableContent,
  };

  const draft = await prisma.$transaction(async (tx) => {
    const newDraft = await tx.pageVersion.create({
      data: {
        pageId: page.id,
        parentPageVersionId: page.currentLivePageVersionId,
        contentState: PageVersionState.DRAFT,
        contentSource: PageVersionSource.MANUAL,
        contentHash: createPageVersionHash({
          title: page.currentLivePageVersion!.title,
          metaDescription: page.currentLivePageVersion!.metaDescription,
          extractedJson: draftExtractedJson,
        }),
        title: page.currentLivePageVersion!.title,
        metaDescription: page.currentLivePageVersion!.metaDescription,
        htmlBlobKey: null,
        markdownBlobKey: null,
        extractedJson: toNullableJsonValue(draftExtractedJson),
        createdBy: "recommendation-generation",
      },
    });

    await tx.draftLink.createMany({
      data: linkedRecommendationIds.map((recId) => ({
        pageId: page.id,
        draftPageVersionId: newDraft.id,
        recommendationId: recId,
      })),
      skipDuplicates: true,
    });

    await tx.recommendation.updateMany({
      where: {
        id: { in: linkedRecommendationIds },
        status: RecommendationStatus.OPEN,
      },
      data: { status: RecommendationStatus.LINKED_TO_DRAFT },
    });

    return newDraft;
  });

  await writeChangeLog({
    workspaceId: page.workspaceId,
    pageId: page.id,
    objectType: "PageVersion",
    objectId: draft.id,
    actionType: "DRAFT_GENERATED_FROM_RECOMMENDATIONS",
    payloadJson: {
      mode,
      linkedRecommendationCount: linkedRecommendationIds.length,
      basedOnPageVersionId: page.currentLivePageVersionId,
    },
  });

  return createdResponse({
    page: { id: page.id, title: page.title, path: page.path },
    draft,
    linkedRecommendationIds,
  });
}
