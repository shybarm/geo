import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { parseCrawlSourceSummary } from "@/lib/crawl-source";
import { prisma } from "@/lib/prisma";

const LIST_LIMIT = 15;

type Signals = {
  indexabilityHint?: string;
  canonicalMatchesPage?: boolean | null;
};

function sig(raw: unknown): Signals {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Signals;
}

function toItem(page: {
  id: string;
  title: string | null;
  path: string;
  latestSuccessfulScanRun: { completedAt: Date | null } | null;
  currentLivePageVersion: { extractedJson: unknown } | null;
}) {
  const s = sig(page.currentLivePageVersion?.extractedJson ?? null);
  const crawl = parseCrawlSourceSummary(page.currentLivePageVersion?.extractedJson ?? null);
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    indexabilityHint: typeof s.indexabilityHint === "string" ? s.indexabilityHint : null,
    canonicalMatchesUrl: typeof s.canonicalMatchesPage === "boolean" ? s.canonicalMatchesPage : null,
    discoveredFromCount: crawl.inferenceAvailable ? crawl.discoveredFromCount : null,
    latestSuccessfulScanAt: page.latestSuccessfulScanRun?.completedAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();

    const pages = await prisma.page.findMany({
      where: {
        existsLive: true,
        currentLivePageVersionId: { not: null },
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: {
        id: true,
        title: true,
        path: true,
        latestSuccessfulScanRunId: true,
        currentLivePageVersion: { select: { extractedJson: true } },
        latestSuccessfulScanRun: { select: { completedAt: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const withSignals = pages.filter((p) => p.currentLivePageVersion?.extractedJson != null);

    const noindexPages = withSignals
      .filter((p) => sig(p.currentLivePageVersion?.extractedJson).indexabilityHint === "noindex")
      .slice(0, LIST_LIMIT)
      .map(toItem);

    const canonicalMismatchPages = withSignals
      .filter((p) => sig(p.currentLivePageVersion?.extractedJson).canonicalMatchesPage === false)
      .slice(0, LIST_LIMIT)
      .map(toItem);

    const neverScannedPages = pages
      .filter((p) => p.latestSuccessfulScanRunId === null)
      .slice(0, LIST_LIMIT)
      .map(toItem);

    const inferenceAvailable = withSignals.some(
      (p) =>
        parseCrawlSourceSummary(p.currentLivePageVersion?.extractedJson ?? null).inferenceAvailable,
    );

    const orphanLikePages = inferenceAvailable
      ? withSignals
          .filter((p) => {
            const crawl = parseCrawlSourceSummary(
              p.currentLivePageVersion?.extractedJson ?? null,
            );
            return crawl.inferenceAvailable && crawl.orphanLike;
          })
          .slice(0, LIST_LIMIT)
          .map(toItem)
      : [];

    return successResponse({
      orphanInferenceAvailable: inferenceAvailable,
      orphanLikePagesCount: orphanLikePages.length,
      noindexPagesCount: noindexPages.length,
      canonicalMismatchPagesCount: canonicalMismatchPages.length,
      neverScannedPagesCount: neverScannedPages.length,
      orphanLikePages,
      noindexPages,
      canonicalMismatchPages,
      neverScannedPages,
    });
  } catch {
    return errorResponse("Failed to fetch coverage risks.", 500);
  }
}
