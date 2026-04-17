import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    clusterId: string;
  }>;
};

type PageSummary = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: Date;
  latestOverallScore: number | null;
  blockersCount: number;
};

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === "object" && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

function getInternalLinkCount(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = (raw as Record<string, unknown>).internalLinkCount;
  return typeof value === "number" ? value : null;
}

function buildPageSummary(page: {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: Date;
  latestSuccessfulScoreSnapshot: { overallScore: unknown; blockersCount: number } | null;
}): PageSummary {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    pageType: page.pageType,
    existsLive: page.existsLive,
    updatedAt: page.updatedAt,
    latestOverallScore: toNumber(page.latestSuccessfulScoreSnapshot?.overallScore),
    blockersCount: page.latestSuccessfulScoreSnapshot?.blockersCount ?? 0,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { clusterId } = await context.params;

    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: {
        memberships: {
          include: {
            page: {
              include: {
                latestSuccessfulScoreSnapshot: true,
                latestSuccessfulScanRun: true,
                currentLivePageVersion: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        missingPageOpportunities: {
          include: {
            page: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!cluster) {
      return errorResponse("Cluster not found.", 404);
    }

    const pages = cluster.memberships.map((membership) => membership.page);
    const totalPages = pages.length;
    const pillarCount = cluster.memberships.filter((membership) => membership.role === "PILLAR").length;
    const supportingCount = cluster.memberships.filter((membership) => membership.role === "SUPPORTING").length;
    const missingCount = cluster.memberships.filter((membership) => membership.role === "MISSING").length;
    const weakCount = cluster.memberships.filter((membership) => membership.role === "WEAK").length;
    const scannedPagesCount = pages.filter((page) => page.latestSuccessfulScanRunId !== null).length;
    const unscannedPagesCount = totalPages - scannedPagesCount;

    const scoredPages = pages
      .map((page) => ({
        page,
        overallScore: toNumber(page.latestSuccessfulScoreSnapshot?.overallScore),
      }))
      .filter((entry) => entry.overallScore !== null);

    const averageOverallScore = scoredPages.length > 0
      ? Number((scoredPages.reduce((sum, entry) => sum + (entry.overallScore ?? 0), 0) / scoredPages.length).toFixed(2))
      : null;

    const lowScorePages = pages
      .filter((page) => {
        const overallScore = toNumber(page.latestSuccessfulScoreSnapshot?.overallScore);
        return overallScore !== null && overallScore < 50;
      })
      .map(buildPageSummary)
      .sort((a, b) => (a.latestOverallScore ?? 0) - (b.latestOverallScore ?? 0));

    const pagesWithBlockers = pages
      .filter((page) => (page.latestSuccessfulScoreSnapshot?.blockersCount ?? 0) > 0)
      .map(buildPageSummary)
      .sort((a, b) => b.blockersCount - a.blockersCount);

    const weaklyLinkedPages = pages
      .filter((page) => {
        const internalLinkCount = getInternalLinkCount(page.currentLivePageVersion?.extractedJson);
        return internalLinkCount !== null && internalLinkCount < 3;
      })
      .map((page) => ({
        ...buildPageSummary(page),
        internalLinkCount: getInternalLinkCount(page.currentLivePageVersion?.extractedJson),
      }));

    const freshnessIssues = pages
      .filter((page) => {
        if (!page.latestSuccessfulScanRun?.completedAt) return true;
        return Date.now() - new Date(page.latestSuccessfulScanRun.completedAt).getTime() > STALE_MS;
      })
      .map((page) => ({
        ...buildPageSummary(page),
        latestSuccessfulScanCompletedAt: page.latestSuccessfulScanRun?.completedAt ?? null,
        freshnessReason: !page.latestSuccessfulScanRun?.completedAt ? "Never scanned" : "Scan is older than 14 days",
      }));

    const healthReasons: string[] = [];
    if (lowScorePages.length > 0) healthReasons.push(`${lowScorePages.length} low-score page${lowScorePages.length === 1 ? "" : "s"}`);
    if (pagesWithBlockers.length > 0) healthReasons.push(`${pagesWithBlockers.length} page${pagesWithBlockers.length === 1 ? " has" : "s have"} blockers`);
    if (weaklyLinkedPages.length > 0) healthReasons.push(`${weaklyLinkedPages.length} weakly linked page${weaklyLinkedPages.length === 1 ? "" : "s"}`);
    if (freshnessIssues.length > 0) healthReasons.push(`${freshnessIssues.length} freshness issue${freshnessIssues.length === 1 ? "" : "s"}`);
    if (cluster.missingPageOpportunities.length > 0) healthReasons.push(`${cluster.missingPageOpportunities.length} missing page opportunit${cluster.missingPageOpportunities.length === 1 ? "y" : "ies"}`);

    const weightedIssueCount =
      lowScorePages.length * 2 +
      pagesWithBlockers.length * 2 +
      weaklyLinkedPages.length +
      freshnessIssues.length +
      cluster.missingPageOpportunities.length +
      unscannedPagesCount;

    let healthStatus = "Healthy";
    if (totalPages === 0 || weightedIssueCount >= Math.max(3, totalPages)) {
      healthStatus = "Weak";
    } else if (weightedIssueCount > 0) {
      healthStatus = "Needs attention";
    }

    return successResponse({
      clusterId: cluster.id,
      clusterName: cluster.name,
      topic: cluster.topic,
      totalPages,
      pillarCount,
      supportingCount,
      missingCount,
      weakCount,
      scannedPagesCount,
      unscannedPagesCount,
      averageOverallScore,
      lowScorePages,
      pagesWithBlockers,
      weaklyLinkedPages,
      missingPageOpportunities: cluster.missingPageOpportunities,
      freshnessIssues,
      healthStatus,
      healthReasons,
    });
  } catch {
    return errorResponse("Failed to fetch cluster health.", 500);
  }
}
