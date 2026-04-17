import { errorResponse, successResponse } from "@/lib/api";
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
    });

    if (!page) {
      return errorResponse("Page not found.", 404);
    }

    try {
      const response = await fetch(page.url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
      });
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");

      if (!response.ok || !isHtml) {
        await prisma.page.update({
          where: { id: page.id },
          data: {
            existsLive: false,
          },
        });

        return errorResponse("Live route verification failed.", 400, {
          verified: false,
          status: response.status,
          contentType: contentType || null,
        });
      }

      const verifiedAt = new Date();
      await prisma.page.update({
        where: { id: page.id },
        data: {
          existsLive: true,
          routeLastVerifiedAt: verifiedAt,
        },
      });

      await writeChangeLog({
        workspaceId: page.workspaceId,
        pageId: page.id,
        objectType: "Page",
        objectId: page.id,
        actionType: "ROUTE_VERIFIED",
        payloadJson: { url: page.url, verifiedAt: verifiedAt.toISOString() },
      });

      return successResponse({
        verified: true,
        routeLastVerifiedAt: verifiedAt.toISOString(),
      });
    } catch (error) {
      await prisma.page.update({
        where: { id: page.id },
        data: {
          existsLive: false,
        },
      });

      if (error instanceof Error) {
        return errorResponse("Live route verification failed.", 400, {
          verified: false,
          message: error.message,
        });
      }

      return errorResponse("Live route verification failed.", 400, {
        verified: false,
      });
    }
  } catch {
    return errorResponse("Failed to verify live route.", 500);
  }
}
