import { SiteSourceType } from "@prisma/client";
import { z } from "zod";

export const createSiteSchema = z.object({
  workspaceId: z.string().trim().min(1),
  domain: z.string().trim().min(1).max(255),
  sourceType: z.nativeEnum(SiteSourceType),
});
