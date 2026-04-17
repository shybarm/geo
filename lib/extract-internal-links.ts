import { normalizeUrl } from "@/lib/normalize-url";

/**
 * Extract all internal (same-domain) href links from raw HTML.
 * Resolves relative URLs against the page base URL.
 * Normalizes same-page variants into one canonical identity.
 */
export function extractInternalLinks(html: string, pageUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const links: string[] = [];

  const pattern = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!raw) continue;
    if (/^(mailto:|tel:|javascript:|#)/i.test(raw)) continue;

    try {
      const resolved = new URL(raw, base);
      if (!["http:", "https:"].includes(resolved.protocol)) continue;
      if (resolved.hostname.toLowerCase() !== base.hostname.toLowerCase()) continue;

      const normalized = normalizeUrl(resolved.toString()).normalizedUrl;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        links.push(normalized);
      }
    } catch {
      // skip unparseable urls
    }
  }

  return links;
}
