type JsonObject = Record<string, unknown>;

export type CrawlSourceSummary = {
  source: string | null;
  discoveredFromUrls: string[];
  discoveredFromPaths: string[];
  discoveredFromCount: number;
  outboundInternalPaths: string[];
  outboundInternalLinkCount: number | null;
  inferenceAvailable: boolean;
  orphanLike: boolean;
};

function asObject(raw: unknown): JsonObject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  return { ...(raw as JsonObject) };
}

function uniqueSortedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

export function parseCrawlSourceSummary(raw: unknown): CrawlSourceSummary {
  const obj = asObject(raw);
  const discoveredFromUrls = uniqueSortedStrings(obj.discoveredFromUrls);
  const discoveredFromPaths = uniqueSortedStrings(obj.discoveredFromPaths);
  const outboundInternalPaths = uniqueSortedStrings(obj.outboundInternalPaths);
  const outboundInternalLinkCount = typeof obj.outboundInternalLinkCount === "number" ? obj.outboundInternalLinkCount : null;
  const source = typeof obj.source === "string" && obj.source.trim() ? obj.source.trim() : null;
  const inferenceAvailable =
    source === "internal-crawl" ||
    discoveredFromUrls.length > 0 ||
    discoveredFromPaths.length > 0 ||
    outboundInternalPaths.length > 0 ||
    outboundInternalLinkCount !== null;

  return {
    source,
    discoveredFromUrls,
    discoveredFromPaths,
    discoveredFromCount: Math.max(discoveredFromUrls.length, discoveredFromPaths.length),
    outboundInternalPaths,
    outboundInternalLinkCount,
    inferenceAvailable,
    orphanLike: inferenceAvailable && source === "internal-crawl" && discoveredFromUrls.length === 0 && discoveredFromPaths.length === 0,
  };
}

export function mergeCrawlSourceMetadata(
  raw: unknown,
  input: {
    discoveredFromUrls?: string[];
    discoveredFromPaths?: string[];
    outboundInternalPaths?: string[];
    outboundInternalLinkCount?: number;
    source?: string;
  },
): JsonObject {
  const obj = asObject(raw);

  const discoveredFromUrls = uniqueSortedStrings([
    ...uniqueSortedStrings(obj.discoveredFromUrls),
    ...(input.discoveredFromUrls ?? []),
  ]);
  const discoveredFromPaths = uniqueSortedStrings([
    ...uniqueSortedStrings(obj.discoveredFromPaths),
    ...(input.discoveredFromPaths ?? []),
  ]);
  const outboundInternalPaths = input.outboundInternalPaths
    ? uniqueSortedStrings(input.outboundInternalPaths)
    : uniqueSortedStrings(obj.outboundInternalPaths);

  if (discoveredFromUrls.length > 0) {
    obj.discoveredFromUrls = discoveredFromUrls;
  }
  if (discoveredFromPaths.length > 0) {
    obj.discoveredFromPaths = discoveredFromPaths;
  }
  if (outboundInternalPaths.length > 0) {
    obj.outboundInternalPaths = outboundInternalPaths;
    obj.outboundInternalLinkCount = input.outboundInternalLinkCount ?? outboundInternalPaths.length;
  } else if (typeof input.outboundInternalLinkCount === "number") {
    obj.outboundInternalLinkCount = input.outboundInternalLinkCount;
  }
  if (input.source && !(typeof obj.source === "string" && obj.source.trim())) {
    obj.source = input.source;
  }

  return obj;
}
