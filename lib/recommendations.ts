import { Prisma, RecommendationType, TaskPriority } from "@prisma/client";

type FindingLike = {
  code: string;
  findingType: string;
};

type ScoreLike = {
  overallScore: Prisma.Decimal | number | string | null;
  authorityTrustScore: Prisma.Decimal | number | string | null;
  severity: number | null;
  blockersCount: number;
  reasonCodesJson: Prisma.JsonValue | null;
};

export type RecommendationCandidate = {
  type: RecommendationType;
  priority: TaskPriority;
  severity: number;
  title: string;
  description: string;
  whyItMatters: string;
  evidenceJson: Prisma.InputJsonValue;
  fingerprint: string;
};

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

export function createRecommendationFingerprint(pageId: string, kind: string) {
  return `${pageId}:${kind}`;
}

export function buildRecommendationCandidates(params: {
  pageId: string;
  currentLivePageVersionId: string;
  score: ScoreLike;
  findings: FindingLike[];
}): RecommendationCandidate[] {
  const { pageId, currentLivePageVersionId, score, findings } = params;
  const candidates: RecommendationCandidate[] = [];
  const overallScore = toNumber(score.overallScore);
  const authorityTrustScore = toNumber(score.authorityTrustScore);

  if (overallScore < 50) {
    candidates.push({
      type: RecommendationType.REWRITE_REQUIRED,
      priority: TaskPriority.HIGH,
      severity: Math.max(score.severity ?? 70, 70),
      title: "Rewrite core page content",
      description:
        "The latest score indicates the current live content is underperforming across the baseline GEO scoring dimensions.",
      whyItMatters: "Low overall score signals weak page usefulness and weak answer quality.",
      evidenceJson: toInputJsonValue({
        overallScore,
        pageVersionId: currentLivePageVersionId,
      }),
      fingerprint: createRecommendationFingerprint(pageId, "rewrite-required"),
    });
  }

  if ((score.blockersCount ?? 0) > 0) {
    candidates.push({
      type: RecommendationType.STRUCTURAL_CHANGE,
      priority: TaskPriority.CRITICAL,
      severity: Math.max(score.severity ?? 80, 80),
      title: "Resolve structural blockers",
      description:
        "The latest scan produced blocker-level findings that need direct structural fixes on the live page version.",
      whyItMatters:
        "Blockers directly reduce scan health and prevent the page from reaching a stable baseline.",
      evidenceJson: toInputJsonValue({
        blockersCount: score.blockersCount,
        blockerCodes: findings.filter((finding) => finding.findingType === "BLOCKER").map((finding) => finding.code),
      }),
      fingerprint: createRecommendationFingerprint(pageId, "structural-change"),
    });
  }

  if (authorityTrustScore < 5) {
    candidates.push({
      type: RecommendationType.AUTHORITY_PROJECT,
      priority: TaskPriority.HIGH,
      severity: 75,
      title: "Strengthen authority signals",
      description: "The latest score shows authority and trust are materially weak for this page.",
      whyItMatters:
        "Weak authority trust makes the page less reliable as a destination for important queries.",
      evidenceJson: toInputJsonValue({
        authorityTrustScore,
        reasonCodes: score.reasonCodesJson,
      }),
      fingerprint: createRecommendationFingerprint(pageId, "authority-project"),
    });
  }

  return candidates;
}
