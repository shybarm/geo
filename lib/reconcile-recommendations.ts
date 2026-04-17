import {
  Prisma,
  RecommendationBatchStatus,
  RecommendationResolutionState,
  RecommendationStatus,
  RecommendationType,
  TaskPriority,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildRecommendationCandidates,
  createRecommendationFingerprint,
} from "@/lib/recommendations";
import { writeChangeLog } from "@/lib/write-change-log";

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return value;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function reconcileRecommendationsForPage(workspaceId: string, pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      latestSuccessfulScoreSnapshot: true,
    },
  });

  if (!page || page.workspaceId !== workspaceId) {
    throw new Error("Page not found.");
  }
  if (!page.currentLivePageVersionId) {
    throw new Error("Page has no current live page version.");
  }
  if (!page.latestSuccessfulScanRunId) {
    throw new Error("Page has no successful scan.");
  }
  if (!page.latestSuccessfulScoreSnapshotId || !page.latestSuccessfulScoreSnapshot) {
    throw new Error("Page has no successful score snapshot.");
  }

  const [latestFindings, activeBatches, historicalRecommendations] = await Promise.all([
    prisma.scanFinding.findMany({
      where: { scanRunId: page.latestSuccessfulScanRunId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.recommendationBatch.findMany({
      where: { pageId: page.id, status: RecommendationBatchStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
    }),
    prisma.recommendation.findMany({
      where: { pageId: page.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const recommendationsToCreate = buildRecommendationCandidates({
    pageId: page.id,
    currentLivePageVersionId: page.currentLivePageVersionId,
    score: page.latestSuccessfulScoreSnapshot,
    findings: latestFindings,
  });

  const findingCodes = new Set(latestFindings.map((finding) => finding.code));
  const authorityTrustScore = toNumber(page.latestSuccessfulScoreSnapshot.authorityTrustScore);
  const expertVisibilityScore = toNumber(page.latestSuccessfulScoreSnapshot.expertVisibilityScore);
  const entityConsistencyScore = toNumber(page.latestSuccessfulScoreSnapshot.entityConsistencyScore);
  const answerClarityScore = toNumber(page.latestSuccessfulScoreSnapshot.answerClarityScore);
  const extractabilityScore = toNumber(page.latestSuccessfulScoreSnapshot.extractabilityScore);

  if (answerClarityScore < 45 && findingCodes.has("WEAK_ANSWER_STRUCTURE")) {
    recommendationsToCreate.push({
      type: RecommendationType.STRUCTURAL_CHANGE,
      priority: TaskPriority.HIGH,
      severity: 68,
      title: "Add a direct answer near the top",
      description:
        "The page has content but it is not structured to deliver a clear answer early. Break text into more paragraphs and open with a direct response to the core topic.",
      whyItMatters:
        "AI systems extract answers from the first clearly structured paragraphs. A buried or absent direct answer reduces citation readiness.",
      evidenceJson: toInputJsonValue({
        answerClarityScore,
        findingCodes: ["WEAK_ANSWER_STRUCTURE"],
      }),
      fingerprint: createRecommendationFingerprint(page.id, "content-direct-answer"),
    });
  }

  if (extractabilityScore < 50 && findingCodes.has("WEAK_HEADING_STRUCTURE")) {
    recommendationsToCreate.push({
      type: RecommendationType.STRUCTURAL_CHANGE,
      priority: TaskPriority.MEDIUM,
      severity: 62,
      title: "Improve heading hierarchy",
      description:
        "The page has very few subheadings relative to its content depth. Add H2 and H3 subheadings to segment content into named, extractable sections.",
      whyItMatters:
        "Heading structure helps AI systems understand content hierarchy and select the right section when answering questions.",
      evidenceJson: toInputJsonValue({
        extractabilityScore,
        findingCodes: ["WEAK_HEADING_STRUCTURE"],
      }),
      fingerprint: createRecommendationFingerprint(page.id, "content-heading-structure"),
    });
  }

  if (findingCodes.has("FAQ_OPPORTUNITY")) {
    recommendationsToCreate.push({
      type: RecommendationType.STRUCTURAL_CHANGE,
      priority: TaskPriority.MEDIUM,
      severity: 58,
      title: "Add a FAQ or Q&A section",
      description:
        "The page has enough content depth to support a dedicated FAQ section. Adding one improves answer coverage and increases the chance of appearing in featured snippets and AI responses.",
      whyItMatters:
        "FAQ sections are highly extractable by AI systems and improve the page's ability to answer multiple related queries.",
      evidenceJson: toInputJsonValue({
        findingCodes: ["FAQ_OPPORTUNITY"],
        extractabilityScore,
      }),
      fingerprint: createRecommendationFingerprint(page.id, "content-faq-section"),
    });
  }

  if (
    authorityTrustScore < 50 &&
    findingCodes.has("NO_AUTHOR_SIGNAL") &&
    findingCodes.has("NO_DATE_SIGNAL")
  ) {
    recommendationsToCreate.push({
      type: RecommendationType.AUTHORITY_PROJECT,
      priority: TaskPriority.MEDIUM,
      severity: 60,
      title: "Add freshness and evidence signals",
      description:
        "The page has no author, reviewer, or date signals. Add a byline, publish date, or last-updated note to establish credibility and freshness.",
      whyItMatters:
        "Evidence of authorship and recency improves both user trust and AI citation confidence.",
      evidenceJson: toInputJsonValue({
        authorityTrustScore,
        findingCodes: ["NO_AUTHOR_SIGNAL", "NO_DATE_SIGNAL"],
      }),
      fingerprint: createRecommendationFingerprint(page.id, "content-evidence-signals"),
    });
  }

  if (
    extractabilityScore < 40 &&
    (findingCodes.has("THIN_CONTENT") || findingCodes.has("LOW_PARAGRAPH_COUNT"))
  ) {
    recommendationsToCreate.push({
      type: RecommendationType.STRUCTURAL_CHANGE,
      priority: TaskPriority.HIGH,
      severity: 65,
      title: "Expand thin content with clearer sections",
      description:
        "The page has too little text or too few paragraphs to be useful as an AI answer source. Expand it with well-structured sections that address the core topic in depth.",
      whyItMatters:
        "Thin pages are rarely cited by AI systems. Depth and structure are required for reliable answer extraction.",
      evidenceJson: toInputJsonValue({
        extractabilityScore,
        findingCodes: Array.from(findingCodes).filter((c) =>
          ["THIN_CONTENT", "LOW_PARAGRAPH_COUNT"].includes(c),
        ),
      }),
      fingerprint: createRecommendationFingerprint(page.id, "content-expand-thin"),
    });
  }

  if (
    authorityTrustScore < 45 &&
    (findingCodes.has("WEAK_CREDENTIAL_INSTITUTION_SIGNAL") ||
      findingCodes.has("NO_AUTHORITY_EVIDENCE_ON_PAGE"))
  ) {
    recommendationsToCreate.push({
      type: RecommendationType.AUTHORITY_PROJECT,
      priority: TaskPriority.HIGH,
      severity: 78,
      title: "Strengthen institution visibility",
      description: "The current scan shows weak or missing institution and credential evidence on the page.",
      whyItMatters: "Institution visibility helps users and AI systems trust the page's authority.",
      evidenceJson: toInputJsonValue({
        authorityTrustScore,
        findingCodes: Array.from(findingCodes).filter((code) =>
          ["WEAK_CREDENTIAL_INSTITUTION_SIGNAL", "NO_AUTHORITY_EVIDENCE_ON_PAGE"].includes(code),
        ),
      }),
      fingerprint: createRecommendationFingerprint(page.id, "authority-institution-visibility"),
    });
  }

  if (expertVisibilityScore < 50 && findingCodes.has("MISSING_AUTHOR_REVIEWER_SIGNAL")) {
    recommendationsToCreate.push({
      type: RecommendationType.AUTHORITY_PROJECT,
      priority: TaskPriority.HIGH,
      severity: 72,
      title: "Add reviewed-by signal",
      description: "The page is missing a visible author or reviewer signal in the current entity coverage.",
      whyItMatters: "Visible expert attribution increases trust and improves expert visibility scoring.",
      evidenceJson: toInputJsonValue({
        expertVisibilityScore,
        findingCodes: ["MISSING_AUTHOR_REVIEWER_SIGNAL"],
      }),
      fingerprint: createRecommendationFingerprint(page.id, "authority-reviewed-by-signal"),
    });
  }

  if (authorityTrustScore < 55 && findingCodes.has("WEAK_CREDENTIAL_INSTITUTION_SIGNAL")) {
    recommendationsToCreate.push({
      type: RecommendationType.AUTHORITY_PROJECT,
      priority: TaskPriority.MEDIUM,
      severity: 68,
      title: "Add author credentials",
      description: "The page has authority entities, but the credential signal is still too weak to support trust.",
      whyItMatters: "Stronger credentials help users and models understand why the page is credible.",
      evidenceJson: toInputJsonValue({
        authorityTrustScore,
        weakSignalCode: "WEAK_CREDENTIAL_INSTITUTION_SIGNAL",
      }),
      fingerprint: createRecommendationFingerprint(page.id, "authority-author-credentials"),
    });
  }

  if (entityConsistencyScore < 50 && findingCodes.has("INCONSISTENT_ENTITY_COVERAGE")) {
    recommendationsToCreate.push({
      type: RecommendationType.STRUCTURAL_CHANGE,
      priority: TaskPriority.MEDIUM,
      severity: 66,
      title: "Align entity naming",
      description: "The current entity signals suggest conflicting or weak naming across authority evidence.",
      whyItMatters: "Aligned names help authority signals stay consistent for both users and AI systems.",
      evidenceJson: toInputJsonValue({
        entityConsistencyScore,
        findingCodes: ["INCONSISTENT_ENTITY_COVERAGE"],
      }),
      fingerprint: createRecommendationFingerprint(page.id, "authority-align-entity-naming"),
    });
  }

  const dedupedRecommendations = Array.from(
    new Map(recommendationsToCreate.map((candidate) => [candidate.fingerprint, candidate])).values(),
  );
  const candidateByFingerprint = new Map(
    dedupedRecommendations.map((candidate) => [candidate.fingerprint, candidate]),
  );
  const historicalByFingerprint = new Map(
    historicalRecommendations.map((recommendation) => [recommendation.fingerprint, recommendation]),
  );
  const activeBatchIds = activeBatches.map((batch) => batch.id);
  const activeRecommendations = historicalRecommendations.filter(
    (recommendation) =>
      recommendation.recommendationBatchId !== null &&
      activeBatchIds.includes(recommendation.recommendationBatchId),
  );
  const now = new Date();

  const reconciled = await prisma.$transaction(async (tx) => {
    const obsoleteRecommendations = activeRecommendations.filter(
      (recommendation) => !candidateByFingerprint.has(recommendation.fingerprint),
    );

    if (obsoleteRecommendations.length > 0) {
      await tx.recommendation.updateMany({
        where: {
          id: {
            in: obsoleteRecommendations.map((recommendation) => recommendation.id),
          },
        },
        data: {
          status: RecommendationStatus.RESOLVED,
          resolutionState: RecommendationResolutionState.AUTO_RESOLVED_AFTER_RESCAN,
          resolvedByPageVersionId: page.currentLivePageVersionId,
          resolvedAt: now,
        },
      });
    }

    if (activeBatchIds.length > 0) {
      await tx.recommendationBatch.updateMany({
        where: {
          id: {
            in: activeBatchIds,
          },
        },
        data: {
          status: RecommendationBatchStatus.SUPERSEDED,
        },
      });
    }

    const batch = await tx.recommendationBatch.create({
      data: {
        workspaceId,
        pageId: page.id,
        scanRunId: page.latestSuccessfulScanRunId,
        pageVersionId: page.currentLivePageVersionId,
        status: RecommendationBatchStatus.ACTIVE,
      },
    });

    const recommendations = [];

    for (const candidate of dedupedRecommendations) {
      const existingRecommendation = historicalByFingerprint.get(candidate.fingerprint);

      if (existingRecommendation) {
        const updatedRecommendation = await tx.recommendation.update({
          where: { id: existingRecommendation.id },
          data: {
            recommendationBatchId: batch.id,
            generatedFromScanRunId: page.latestSuccessfulScanRunId,
            generatedFromPageVersionId: page.currentLivePageVersionId,
            type: candidate.type,
            priority: candidate.priority,
            severity: candidate.severity,
            title: candidate.title,
            description: candidate.description,
            whyItMatters: candidate.whyItMatters,
            evidenceJson: candidate.evidenceJson,
            status: RecommendationStatus.OPEN,
            resolutionState: RecommendationResolutionState.UNRESOLVED,
            resolvedByPageVersionId: null,
            resolvedAt: null,
          },
        });
        recommendations.push(updatedRecommendation);
        continue;
      }

      const createdRecommendation = await tx.recommendation.create({
        data: {
          workspaceId,
          pageId: page.id,
          recommendationBatchId: batch.id,
          generatedFromScanRunId: page.latestSuccessfulScanRunId,
          generatedFromPageVersionId: page.currentLivePageVersionId,
          type: candidate.type,
          priority: candidate.priority,
          severity: candidate.severity,
          title: candidate.title,
          description: candidate.description,
          whyItMatters: candidate.whyItMatters,
          evidenceJson: candidate.evidenceJson,
          status: RecommendationStatus.OPEN,
          resolutionState: RecommendationResolutionState.UNRESOLVED,
          fingerprint: candidate.fingerprint,
        },
      });
      recommendations.push(createdRecommendation);
    }

    return {
      batch,
      recommendations,
    };
  });

  await writeChangeLog({
    workspaceId,
    pageId,
    objectType: "RecommendationBatch",
    objectId: reconciled.batch.id,
    actionType: "RECOMMENDATIONS_RECONCILED",
    payloadJson: {
      recommendationCount: reconciled.recommendations.length,
      scanRunId: page.latestSuccessfulScanRunId,
    },
  });

  return reconciled;
}
