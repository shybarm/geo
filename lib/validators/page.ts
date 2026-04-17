import { z } from "zod";

export const createPageSchema = z.object({
  workspaceId: z.string().trim().min(1),
  siteId: z.string().trim().min(1),
  url: z.string().trim().url(),
  canonicalUrl: z.union([z.string().trim().url(), z.null()]).optional(),
  path: z.string().trim().min(1).max(2048),
  slug: z.string().trim().min(1).max(255),
  title: z.union([z.string().trim().min(1).max(500), z.null()]).optional(),
  pageType: z.union([z.string().trim().min(1).max(100), z.null()]).optional(),
});
