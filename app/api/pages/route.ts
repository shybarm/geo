import { createHash } from "node:crypto";

import {
  PageLifecycleStatus,
  PageSourceStatus,
  PageVersionSource,
  PageVersionState,
  Prisma,
} from "@prisma/client";

import { writeChangeLog } from "@/lib/write-change-log";

import { createdResponse, errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createPageSchema } from "@/lib/validators/page";

function createPageContentHash(input: {
  workspaceId: string;
  siteId: string;
  url: string;
  canonicalUrl: string | null;
  path: string;
  slug: string;
  title: string | null;
  pageType: string | null;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function parseBooleanFlag(value: string | null) {
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return null
}

const STALE_DAYS = 14;
const FRESH_DAYS = 7;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const siteId = searchParams.get("siteId")?.trim();
    const lifecycleStatus = searchParams.get("lifecycleStatus")?.trim();
    const existsLive = parseBooleanFlag(searchParams.get("existsLive")?.trim() ?? null);
    const hasScan = parseBooleanFlag(searchParams.get("hasScan")?.trim() ?? null);
    const hasRecommendations = parseBooleanFlag(searchParams.get("hasRecommendations")?.trim() ?? null);
    const freshness = searchParams.get("freshness")?.trim(); // "stale" | "never" | "fresh"

    const freshnessWhere: Prisma.PageWhereInput =
      freshness === "never"
        ? { currentLivePageVersionId: { not: null }, latestSuccessfulScanRunId: null }
        : freshness === "stale"
          ? {
              currentLivePageVersionId: { not: null },
              OR: [
                { latestSuccessfulScanRunId: null },
                { latestSuccessfulScanRun: { completedAt: { lt: daysAgo(STALE_DAYS) } } },
              ],
            }
          : freshness === "fresh"
            ? { latestSuccessfulScanRun: { completedAt: { gte: daysAgo(FRESH_DAYS) } } }
            : {};

    const where: Prisma.PageWhereInput = {
      ...(workspaceId ? { workspaceId } : {}),
      ...(siteId ? { siteId } : {}),
      ...(lifecycleStatus ? { lifecycleStatus: lifecycleStatus as PageLifecycleStatus } : {}),
      ...(existsLive === null ? {} : { existsLive }),
      ...(hasScan === null
        ? {}
        : hasScan
          ? { latestScanRunId: { not: null } }
          : { latestScanRunId: null }),
      ...(hasRecommendations === null
        ? {}
        : hasRecommendations
          ? { recommendations: { some: {} } }
          : { recommendations: { none: {} } }),
      ...freshnessWhere,
    };

    const pages = await prisma.page.findMany({
      where,
      include: {
        currentLivePageVersion: {
          select: {
            extractedJson: true,
          },
        },
        latestSuccessfulScanRun: {
          select: { completedAt: true },
        },
        latestSuccessfulScoreSnapshot: {
          select: {
            overallScore: true,
          },
        },
        _count: {
          select: {
            recommendations: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return successResponse(pages);
  } catch {
    return errorResponse("Failed to fetch pages.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createPageSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid page payload.", 400, parsed.error.flatten());
    }

    const pageInput = {
      workspaceId: parsed.data.workspaceId,
      siteId: parsed.data.siteId,
      url: parsed.data.url,
      canonicalUrl: parsed.data.canonicalUrl ?? null,
      path: parsed.data.path,
      slug: parsed.data.slug,
      title: parsed.data.title ?? null,
      pageType: parsed.data.pageType ?? null,
    };

    const contentHash = createPageContentHash(pageInput);

    const page = await prisma.$transaction(async (tx) => {
      const createdPage = await tx.page.create({
        data: {
          ...pageInput,
          lifecycleStatus: PageLifecycleStatus.DISCOVERED,
          sourceStatus: PageSourceStatus.MANUAL,
          existsLive: false,
        },
      });

      const pageVersion = await tx.pageVersion.create({
        data: {
          pageId: createdPage.id,
          contentState: PageVersionState.LIVE_SNAPSHOT,
          contentSource: PageVersionSource.MANUAL,
          contentHash,
          title: pageInput.title,
          metaDescription: null,
          htmlBlobKey: null,
          markdownBlobKey: null,
          extractedJson: {
            url: pageInput.url,
            canonicalUrl: pageInput.canonicalUrl,
            path: pageInput.path,
            slug: pageInput.slug,
            title: pageInput.title,
            pageType: pageInput.pageType,
          } as Prisma.InputJsonValue,
          createdBy: "system",
        },
      });

      return tx.page.update({
        where: { id: createdPage.id },
        data: {
          currentLivePageVersionId: pageVersion.id,
          lifecycleStatus: PageLifecycleStatus.DISCOVERED,
        },
      });
    });

    await writeChangeLog({
      workspaceId: page.workspaceId,
      pageId: page.id,
      objectType: "Page",
      objectId: page.id,
      actionType: "PAGE_CREATED",
      payloadJson: { path: page.path, title: page.title, sourceStatus: page.sourceStatus },
    });

    return createdResponse(page);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create page.", 400, error.message);
    }

    return errorResponse("Failed to create page.", 500);
  }
}
