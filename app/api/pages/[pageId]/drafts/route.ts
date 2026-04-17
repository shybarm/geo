import { PageVersionSource, PageVersionState } from "@prisma/client";

import { createdResponse, errorResponse } from "@/lib/api";
import { createPageVersionHash, toNullableJsonValue } from "@/lib/page-version";
import { prisma } from "@/lib/prisma";
import { writeChangeLog } from "@/lib/write-change-log";

type RouteContext = {
  params: Promise<{
    pageId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        currentLivePageVersion: true,
      },
    });

    if (!page) {
      return errorResponse("Page not found.", 404);
    }

    if (!page.currentLivePageVersionId || !page.currentLivePageVersion) {
      return errorResponse("Page has no current live page version.", 400);
    }

    const draftTitle = page.currentLivePageVersion.title ?? null;
    const draftMetaDescription = page.currentLivePageVersion.metaDescription ?? null;
    const extractedJson = page.currentLivePageVersion.extractedJson;

    const draft = await prisma.pageVersion.create({
      data: {
        pageId: page.id,
        parentPageVersionId: page.currentLivePageVersionId,
        contentState: PageVersionState.DRAFT,
        contentSource: PageVersionSource.MANUAL,
        contentHash: createPageVersionHash({
          title: draftTitle,
          metaDescription: draftMetaDescription,
          extractedJson,
        }),
        title: draftTitle,
        metaDescription: draftMetaDescription,
        htmlBlobKey: null,
        markdownBlobKey: null,
        extractedJson: toNullableJsonValue(extractedJson),
        createdBy: "user",
      },
    });

    await writeChangeLog({
      workspaceId: page.workspaceId,
      pageId: page.id,
      objectType: "PageVersion",
      objectId: draft.id,
      actionType: "DRAFT_CREATED",
      payloadJson: { pageId: page.id, parentVersionId: page.currentLivePageVersionId },
    });

    return createdResponse(draft);
  } catch {
    return errorResponse("Failed to create draft.", 500);
  }
}
