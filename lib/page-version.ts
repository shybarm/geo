import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

type PageVersionHashInput = {
  title: string | null;
  metaDescription: string | null;
  extractedJson: unknown;
};

export function createPageVersionHash(input: PageVersionHashInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function toNullableJsonValue(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
