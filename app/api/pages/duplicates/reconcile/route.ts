import { PageLifecycleStatus } from "@prisma/client";

import { errorResponse, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { writeChangeLog } from "@/lib/write-change-log";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { workspaceId, primaryPageId, duplicatePageIds } = body as {
      workspaceId?: string;
      primaryPageId?: string;
      duplicatePageIds?: string[];
    };

    if (!workspaceId || typeof workspaceId !== "string") {
      return errorResponse("workspaceId is required.", 400);
    }
    if (!primaryPageId || typeof primaryPageId !== "string") {
      return errorResponse("primaryPageId is required.", 400);
    }
    if (
      !Array.isArray(duplicatePageIds) ||
      duplicatePageIds.length === 0 ||
      duplicatePageIds.some((id) => typeof id !== "string")
    ) {
      return errorResponse("duplicatePageIds must be a non-empty array of strings.", 400);
    }

    // Prevent archiving the primary itself
    const safeIds = duplicatePageIds.filter((id) => id !== primaryPageId);
    if (safeIds.length === 0) {
      return errorResponse("duplicatePageIds must not include the primaryPageId.", 400);
    }

    // Load all involved pages
    const allIds = [primaryPageId, ...safeIds];
    const pages = await prisma.page.findMany({
      where: { id: { in: allIds }, workspaceId },
      select: { id: true, siteId: true, workspaceId: true, lifecycleStatus: true, path: true },
    });

    const primaryPage = pages.find((p) => p.id === primaryPageId);
    if (!primaryPage) {
      return errorResponse("Primary page not found or does not belong to this workspace.", 404);
    }

    const duplicatePages = pages.filter((p) => safeIds.includes(p.id));
    if (duplicatePages.length === 0) {
      return errorResponse("No valid duplicate pages found.", 404);
    }

    // Validate all pages share the same siteId
    const uniqueSiteIds = new Set(pages.map((p) => p.siteId));
    if (uniqueSiteIds.size > 1) {
      return errorResponse("All pages must belong to the same site.", 422);
    }

    // Archive duplicates in a transaction
    const archivedIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const dup of duplicatePages) {
        if (dup.lifecycleStatus === PageLifecycleStatus.ARCHIVED) continue;
        await tx.page.update({
          where: { id: dup.id },
          data: {
            lifecycleStatus: PageLifecycleStatus.ARCHIVED,
            existsLive: false,
          },
        });
        archivedIds.push(dup.id);
      }
    });

    // Fire-and-forget change log entries for each archived page
    for (const id of archivedIds) {
      const dup = duplicatePages.find((p) => p.id === id);
      void writeChangeLog({
        workspaceId,
        pageId: id,
        objectType: "page",
        objectId: id,
        actionType: "DUPLICATE_RECONCILED",
        payloadJson: {
          primaryPageId,
          duplicatePath: dup?.path ?? null,
          reason: "Archived as duplicate via reconcile workflow",
        },
      });
    }

    return successResponse({
      primaryPageId,
      archivedDuplicatePageIds: archivedIds,
      reconciledCount: archivedIds.length,
    });
  } catch {
    return errorResponse("Failed to reconcile duplicates.", 500);
  }
}
