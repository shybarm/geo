import { PageLifecycleStatus, PageVersionSource, PageVersionState, Prisma } from "@prisma/client";
import { z } from "zod";

import { createdResponse, errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { writeChangeLog } from "@/lib/write-change-log";

const applyDraftSchema = z.object({
  pageVersionId: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{
    pageId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { pageId } = await context.params;
    const json = await request.json();
    const parsed = applyDraftSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid apply payload.", 400, parsed.error.flatten());
    }

    const page = await prisma.page.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      return errorResponse("Page not found.", 404);
    }

    const draft = await prisma.pageVersion.findUnique({
      where: { id: parsed.data.pageVersionId },
    });

    if (!draft || draft.pageId !== page.id || draft.contentState !== PageVersionState.DRAFT) {
      return errorResponse("Draft page version not found.", 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const liveVersion = await tx.pageVersion.create({
        data: {
          pageId: page.id,
          parentPageVersionId: draft.id,
          contentState: PageVersionState.LIVE_SNAPSHOT,
          contentSource: PageVersionSource.MANUAL,
          contentHash: draft.contentHash,
          title: draft.title,
          metaDescription: draft.metaDescription,
          htmlBlobKey: draft.htmlBlobKey,
          markdownBlobKey: draft.markdownBlobKey,
          extractedJson: draft.extractedJson as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          createdBy: "system",
        },
      });

      const updatedPage = await tx.page.update({
        where: { id: page.id },
        data: {
          currentLivePageVersionId: liveVersion.id,
          lifecycleStatus: PageLifecycleStatus.ACTIVE,
          title: draft.title,
        },
      });

      return {
        page: updatedPage,
        liveVersion,
        verifiedLive: false,
      };
    });

    await writeChangeLog({
      workspaceId: result.page.workspaceId,
      pageId: result.page.id,
      objectType: "Page",
      objectId: result.page.id,
      actionType: "DRAFT_APPLIED",
      payloadJson: {
        draftVersionId: parsed.data.pageVersionId,
        liveVersionId: result.liveVersion.id,
        lifecycleStatus: result.page.lifecycleStatus,
      },
    });

    return createdResponse(result);
  } catch {
    return errorResponse("Failed to apply draft.", 500);
  }
}
