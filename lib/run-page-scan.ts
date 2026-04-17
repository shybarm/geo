import { Prisma, ScanRunStatus, ScanTriggerType } from "@prisma/client";

import { buildGeoScore } from "./geo-score";
import { extractPage } from "./extract-page";
import { fetchPage } from "./fetch-page";
import { writeChangeLog } from "./write-change-log";
import { prisma } from "./prisma";

export type PageScanResult =
  | { status: "completed"; scanRunId: string }
  | { status: "failed"; scanRunId: string; failureCode: string; errorMessage: string };

function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export async function runPageScan(
  workspaceId: string,
  pageId: string,
  triggerType: ScanTriggerType = ScanTriggerType.MANUAL_RESCAN
): Promise<PageScanResult> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { currentLivePageVersion: true },
  });

  if (!page || !page.currentLivePageVersionId || !page.currentLivePageVersion) {
    throw new Error(`Page ${pageId} has no current live version.`);
  }

  const now = new Date();
  const fetchResult = await fetchPage(page.url);

  if (!fetchResult.ok) {
    const scan = await prisma.$transaction(async (tx) => {
      const s = await tx.scanRun.create({
        data: {
          workspaceId,
          pageId: page.id,
          pageVersionId: page.currentLivePageVersionId,
          triggerType,
          status: ScanRunStatus.FAILED,
          failureCode: fetchResult.failureCode,
          errorMessage: fetchResult.errorMessage,
          startedAt: now,
          completedAt: now,
        },
      });
      await tx.page.update({
        where: { id: page.id },
        data: { latestScanRunId: s.id },
      });
      return s;
    });

    await writeChangeLog({
      workspaceId,
      pageId: page.id,
      objectType: "ScanRun",
      objectId: scan.id,
      actionType: "SCAN_FAILED",
      payloadJson: {
        failureCode: fetchResult.failureCode,
        errorMessage: fetchResult.errorMessage,
        triggerType,
      },
    });

    return {
      status: "failed",
      scanRunId: scan.id,
      failureCode: fetchResult.failureCode,
      errorMessage: fetchResult.errorMessage,
    };
  }

  const entitySignals = await prisma.pageEntitySignal.findMany({
    where: {
      pageId: page.id,
      OR: [
        { pageVersionId: page.currentLivePageVersionId },
        { pageVersionId: null },
      ],
    },
    include: {
      entity: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const extract = extractPage(fetchResult.html, fetchResult.finalUrl);
  const scored = buildGeoScore(page, page.currentLivePageVersion, extract, entitySignals);
  const existingExtractedJson = asJsonObject(page.currentLivePageVersion.extractedJson);

  const extractedJsonSummary: Record<string, unknown> = {
    fetchedAt: now.toISOString(),
    finalUrl: extract.finalUrl,
    title: extract.title,
    metaDescription: extract.metaDescription,
    canonicalHref: extract.canonicalHref || null,
    robotsMetaContent: extract.robotsMetaContent || null,
    ogTitle: extract.ogTitle || null,
    ogDescription: extract.ogDescription || null,
    hasJsonLd: extract.hasJsonLd,
    schemaTypeHints: extract.schemaTypeHints,
    indexabilityHint: extract.indexabilityHint,
    canonicalMatchesPage: extract.canonicalMatchesPage,
    listCount: extract.listCount,
    tableCount: extract.tableCount,
    hasFaqSchema: extract.hasFaqSchema,
    hasArticleSchema: extract.hasArticleSchema,
    hasOrganizationSchema: extract.hasOrganizationSchema,
    hasPersonSchema: extract.hasPersonSchema,
    h1Count: extract.h1Count,
    headingCount: extract.headingCount,
    paragraphCount: extract.paragraphCount,
    internalLinkCount: extract.internalLinkCount,
    externalLinkCount: extract.externalLinkCount,
    textLength: extract.textLength,
    hasFaqSection: extract.hasFaqSection,
    hasAuthorOrReviewer: extract.hasAuthorOrReviewer,
    hasDateOrUpdate: extract.hasDateOrUpdate,
    entitySignalCount: entitySignals.length,
  };

  const mergedExtractedJson = {
    ...existingExtractedJson,
    ...extractedJsonSummary,
  };

  const scan = await prisma.$transaction(async (tx) => {
    const s = await tx.scanRun.create({
      data: {
        workspaceId,
        pageId: page.id,
        pageVersionId: page.currentLivePageVersionId,
        triggerType,
        status: ScanRunStatus.COMPLETED,
        startedAt: now,
        completedAt: new Date(),
      },
    });

    const score = await tx.scoreSnapshot.create({
      data: {
        workspaceId,
        pageId: page.id,
        pageVersionId: page.currentLivePageVersionId,
        scanRunId: s.id,
        ...scored.scores,
      },
    });

    await tx.scanFinding.createMany({
      data: scored.findings.map((f) => ({
        scanRunId: s.id,
        pageId: page.id,
        pageVersionId: page.currentLivePageVersionId,
        findingType: f.findingType,
        code: f.code,
        title: f.title,
        severity: f.severity,
        evidenceJson: f.evidenceJson as Prisma.InputJsonValue,
        explanation: f.explanation,
      })),
    });

    await tx.pageVersion.update({
      where: { id: page.currentLivePageVersionId! },
      data: {
        title: extract.title || page.currentLivePageVersion!.title,
        metaDescription: extract.metaDescription || page.currentLivePageVersion!.metaDescription,
        extractedJson: mergedExtractedJson as Prisma.InputJsonValue,
      },
    });

    await tx.page.update({
      where: { id: page.id },
      data: {
        latestScanRunId: s.id,
        latestSuccessfulScanRunId: s.id,
        latestScoreSnapshotId: score.id,
        latestSuccessfulScoreSnapshotId: score.id,
      },
    });

    return s;
  });

  await writeChangeLog({
    workspaceId,
    pageId: page.id,
    objectType: "ScanRun",
    objectId: scan.id,
    actionType: "SCAN_COMPLETED",
    payloadJson: {
      triggerType,
      overallScore: scored.scores.overallScore,
      blockersCount: scored.scores.blockersCount,
      findingsCount: scored.findings.length,
    },
  });

  return { status: "completed", scanRunId: scan.id };
}
