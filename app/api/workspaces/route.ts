import { Prisma } from "@prisma/client";

import { createdResponse, errorResponse, slugify, successResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { createWorkspaceSchema } from "@/lib/validators/workspace";

async function createUniqueWorkspaceSlug(name: string) {
  const baseSlug = slugify(name) || "workspace";
  let slug = baseSlug;
  let suffix = 1;

  while (await prisma.workspace.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  return slug;
}

export async function GET() {
  try {
    const workspaces = await prisma.workspace.findMany({
      orderBy: { createdAt: "desc" },
    });

    return successResponse(workspaces);
  } catch {
    return errorResponse("Failed to fetch workspaces.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = createWorkspaceSchema.safeParse(json);

    if (!parsed.success) {
      return errorResponse("Invalid workspace payload.", 400, parsed.error.flatten());
    }

    const slug = await createUniqueWorkspaceSlug(parsed.data.name);

    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug,
      },
    });

    return createdResponse(workspace);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return errorResponse("Failed to create workspace.", 400, error.message);
    }

    return errorResponse("Failed to create workspace.", 500);
  }
}
