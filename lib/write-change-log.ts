import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

type ChangeLogInput = {
  workspaceId: string;
  pageId?: string | null;
  objectType: string;
  objectId: string;
  actionType: string;
  payloadJson?: Record<string, unknown> | null;
};

/**
 * Fire-and-forget change log write. Never throws — log failures must not
 * break the caller's main action.
 */
export async function writeChangeLog(input: ChangeLogInput): Promise<void> {
  try {
    await prisma.changeLog.create({
      data: {
        workspaceId: input.workspaceId,
        pageId: input.pageId ?? null,
        actorUserId: null,
        objectType: input.objectType,
        objectId: input.objectId,
        actionType: input.actionType,
        payloadJson: input.payloadJson
          ? (input.payloadJson as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch {
    // Intentionally swallowed — audit writes must not break main flows
  }
}
