import { MissingPageStatus, PageLifecycleStatus, PageSourceStatus, PageVersionSource, PageVersionState, Prisma } from "@prisma/client";

import { createdResponse, errorResponse } from "@/lib/api";
import { createPageVersionHash, toNullableJsonValue } from "@/lib/page-version";
import { prisma } from "@/lib/prisma";
import { writeChangeLog } from "@/lib/write-change-log";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function normalizeSlug(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const opportunity = await prisma.missingPageOpportunity.findUnique({
      where: { id },
      include: {
        page: true,
        cluster: {
          include: {
            memberships: {
              include: {
                page: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!opportunity) {
      return errorResponse("Missing page opportunity not found.", 404);
    }

    if (!opportunity.workspaceId || !opportunity.proposedTitle || !opportunity.proposedSlug || !opportunity.pageType) {
      return errorResponse("Missing page opportunity is incomplete.", 400);
    }

    if (opportunity.status === MissingPageStatus.DRAFT_CREATED && opportunity.pageId) {
      return errorResponse("Draft page already created for this opportunity.", 400);
    }

    const normalizedSlug = normalizeSlug(opportunity.proposedSlug);

    if (!normalizedSlug) {
      return errorResponse("Missing page opportunity slug is invalid.", 400);
    }

    const inferredSiteId = opportunity.page?.siteId ?? opportunity.cluster?.memberships.find((membership) => membership.page?.siteId)?.page.siteId ?? null;

    if (!inferredSiteId) {
      return errorResponse("Could not determine a site for this missing page opportunity.", 400);
    }

    const site = await prisma.site.findUnique({
      where: { id: inferredSiteId },
    });

    if (!site) {
      return errorResponse("Site for missing page opportunity not found.", 404);
    }

    const path = `/${normalizedSlug}`;
    const url = `https://${site.domain}${path}`;
    const extractedJson = {
      title: opportunity.proposedTitle,
      slug: normalizedSlug,
      pageType: opportunity.pageType,
      rationale: opportunity.rationale,
      source: "missing-page-opportunity",
    };

    const result = await prisma.$transaction(async (tx) => {
      const page = await tx.page.create({
        data: {
          workspaceId: opportunity.workspaceId,
          siteId: site.id,
          url,
          canonicalUrl: url,
          path,
          slug: normalizedSlug,
          title: opportunity.proposedTitle,
          pageType: opportunity.pageType,
          lifecycleStatus: PageLifecycleStatus.DRAFT_ONLY,
          sourceStatus: PageSourceStatus.GENERATED,
          existsLive: false,
        },
      });

      const draftPageVersion = await tx.pageVersion.create({
        data: {
          pageId: page.id,
          contentState: PageVersionState.DRAFT,
          contentSource: PageVersionSource.AI_DRAFT,
          contentHash: createPageVersionHash({
            title: opportunity.proposedTitle,
            metaDescription: null,
            extractedJson,
          }),
          title: opportunity.proposedTitle,
          metaDescription: null,
          htmlBlobKey: null,
          markdownBlobKey: null,
          extractedJson: toNullableJsonValue(extractedJson),
          createdBy: "system",
        },
      });

      await tx.draftLink.create({
        data: {
          pageId: page.id,
          draftPageVersionId: draftPageVersion.id,
        },
      });

      const updatedOpportunity = await tx.missingPageOpportunity.update({
        where: { id: opportunity.id },
        data: {
          pageId: page.id,
          status: MissingPageStatus.DRAFT_CREATED,
        },
        include: {
          cluster: true,
          page: true,
        },
      });

      return {
        opportunity: updatedOpportunity,
        page,
        draftPageVersion,
      };
    });

    await writeChangeLog({
      workspaceId: result.page.workspaceId,
      pageId: result.page.id,
      objectType: "Page",
      objectId: result.page.id,
      actionType: "MISSING_PAGE_DRAFT_CREATED",
      payloadJson: {
        opportunityId: id,
        proposedTitle: opportunity.proposedTitle,
        draftVersionId: result.draftPageVersion.id,
        path: result.page.path,
      },
    });

    return createdResponse(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create draft page from missing page opportunity.", 400, error.message);
    }

    return errorResponse("Failed to create draft page from missing page opportunity.", 500);
  }
}
