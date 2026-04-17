import { PageVersionState } from "@prisma/client";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api";
import { createPageVersionHash, toNullableJsonValue } from "@/lib/page-version";
import { prisma } from "@/lib/prisma";

const updatePageVersionSchema = z.object({
  title: z.union([z.string(), z.null()]).optional(),
  metaDescription: z.union([z.string(), z.null()]).optional(),
  extractedJson: z.unknown().optional(),
});

type RouteContext = {
  params: Promise<{
    pageVersionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { pageVersionId } = await context.params;
    const json = await request.json();
    const parsed = updatePageVersionSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid page version payload.", 400, parsed.error.flatten());
    }

    const existingVersion = await prisma.pageVersion.findUnique({
      where: { id: pageVersionId },
    });

    if (!existingVersion) {
      return errorResponse("Page version not found.", 404);
    }

    if (existingVersion.contentState !== PageVersionState.DRAFT) {
      return errorResponse("Only draft page versions can be updated.", 400);
    }

    const title = parsed.data.title === undefined ? existingVersion.title : parsed.data.title;
    const metaDescription =
      parsed.data.metaDescription === undefined
        ? existingVersion.metaDescription
        : parsed.data.metaDescription;
    const extractedJson =
      parsed.data.extractedJson === undefined ? existingVersion.extractedJson : parsed.data.extractedJson;

    const updatedVersion = await prisma.pageVersion.update({
      where: { id: pageVersionId },
      data: {
        title,
        metaDescription,
        extractedJson: toNullableJsonValue(extractedJson),
        contentHash: createPageVersionHash({
          title,
          metaDescription,
          extractedJson,
        }),
      },
    });

    return successResponse(updatedVersion);
  } catch {
    return errorResponse("Failed to update page version.", 500);
  }
}
