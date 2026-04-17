import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { parseCrawlSourceSummary } from "@/lib/crawl-source";
import { prisma } from "@/lib/prisma";

const WEAK_LINK_THRESHOLD = 3;
const STRONG_TEXT_THRESHOLD = 2000;
const STRONG_HEADING_THRESHOLD = 4;

type ExtractedSignals = {
  internalLinkCount?: number;
  externalLinkCount?: number;
  textLength?: number;
  headingCount?: number;
  hasFaqSection?: boolean;
};

function parseSignals(raw: unknown): ExtractedSignals {
  if (raw === null || typeof raw !== "object") return {};
  return raw as ExtractedSignals;
}

function toItem(page: {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  sourceStatus: string;
  updatedAt: Date;
  latestSuccessfulScoreSnapshot: { overallScore: unknown } | null;
  currentLivePageVersion: { extractedJson: unknown } | null;
}) {
  const signals = parseSignals(page.currentLivePageVersion?.extractedJson ?? null);
  const crawlSource = parseCrawlSourceSummary(page.currentLivePageVersion?.extractedJson ?? null);

  return {
    id: page.id,
    title: page.title,
    path: page.path,
    pageType: page.pageType,
    existsLive: page.existsLive,
    sourceStatus: page.sourceStatus,
    updatedAt: page.updatedAt.toISOString(),
    internalLinkCount: signals.internalLinkCount ?? null,
    latestOverallScore:
      page.latestSuccessfulScoreSnapshot?.overallScore != null
        ? Number(page.latestSuccessfulScoreSnapshot.overallScore)
        : null,
    discoveredFromCount: crawlSource.discoveredFromCount,
    discoveredFromPaths: crawlSource.discoveredFromPaths.slice(0, 3),
    orphanLike: crawlSource.orphanLike,
  };
}

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const siteId = searchParams.get("siteId")?.trim();

    const baseWhere = {
      currentLivePageVersionId: { not: null as null },
      existsLive: true,
      ...(workspaceId ? { workspaceId } : {}),
      ...(siteId ? { siteId } : {}),
    };

    const pages = await prisma.page.findMany({
      where: baseWhere,
      select: {
        id: true,
        title: true,
        path: true,
        pageType: true,
        existsLive: true,
        sourceStatus: true,
        updatedAt: true,
        currentLivePageVersion: {
          select: { extractedJson: true },
        },
        latestSuccessfulScoreSnapshot: {
          select: { overallScore: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const scanned = pages.filter((page) => page.currentLivePageVersion?.extractedJson != null);
    const inferenceAvailable = scanned.some((page) => parseCrawlSourceSummary(page.currentLivePageVersion?.extractedJson ?? null).inferenceAvailable);

    const weaklyLinkedPages = scanned
      .filter((page) => {
        const signals = parseSignals(page.currentLivePageVersion?.extractedJson);
        return typeof signals.internalLinkCount === "number" && signals.internalLinkCount < WEAK_LINK_THRESHOLD;
      })
      .slice(0, 30)
      .map(toItem);

    const orphanLikePages = inferenceAvailable
      ? scanned
          .filter((page) => {
            const crawlSource = parseCrawlSourceSummary(page.currentLivePageVersion?.extractedJson ?? null);
            return page.sourceStatus === "CRAWLED" && crawlSource.orphanLike;
          })
          .slice(0, 30)
          .map(toItem)
      : [];

    const faqLikePagesWithoutLinks = scanned
      .filter((page) => {
        const signals = parseSignals(page.currentLivePageVersion?.extractedJson);
        return signals.hasFaqSection === true && typeof signals.internalLinkCount === "number" && signals.internalLinkCount < WEAK_LINK_THRESHOLD;
      })
      .slice(0, 20)
      .map(toItem);

    const topLinkCandidates = scanned
      .filter((page) => {
        const signals = parseSignals(page.currentLivePageVersion?.extractedJson);
        const hasStrengthSignal =
          (typeof signals.textLength === "number" && signals.textLength > STRONG_TEXT_THRESHOLD) ||
          (typeof signals.headingCount === "number" && signals.headingCount > STRONG_HEADING_THRESHOLD);
        const isWeak = typeof signals.internalLinkCount === "number" && signals.internalLinkCount < WEAK_LINK_THRESHOLD;
        return hasStrengthSignal && isWeak;
      })
      .slice(0, 20)
      .map(toItem);

    return successResponse({
      thresholds: {
        weakLink: WEAK_LINK_THRESHOLD,
        strongText: STRONG_TEXT_THRESHOLD,
        strongHeading: STRONG_HEADING_THRESHOLD,
      },
      orphanInferenceAvailable: inferenceAvailable,
      weaklyLinkedPagesCount: weaklyLinkedPages.length,
      orphanLikePagesCount: orphanLikePages.length,
      faqLikePagesCount: faqLikePagesWithoutLinks.length,
      topLinkCandidatesCount: topLinkCandidates.length,
      weaklyLinkedPages,
      orphanLikePages,
      faqLikePagesWithoutLinks,
      topLinkCandidates,
    });
  } catch {
    return errorResponse("Failed to fetch link opportunities.", 500);
  }
}
