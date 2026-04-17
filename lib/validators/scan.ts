import { z } from "zod";

export const createScanSchema = z.object({
  workspaceId: z.string().trim().min(1),
  pageId: z.string().trim().min(1),
});
