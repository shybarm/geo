import { errorResponse, parseSearchParams, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const searchParams = parseSearchParams(request.url);
    const workspaceId = searchParams.get("workspaceId")?.trim();
    const pageId = searchParams.get("pageId")?.trim();
    const objectType = searchParams.get("objectType")?.trim();

    const changeLogs = await prisma.changeLog.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        ...(pageId ? { pageId } : {}),
        ...(objectType ? { objectType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return successResponse(changeLogs);
  } catch {
    return errorResponse("Failed to fetch change logs.", 500);
  }
}
