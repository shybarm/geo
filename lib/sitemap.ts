import { normalizeUrl } from "@/lib/normalize-url";

// ─── XML helpers ──────────────────────────────────────────────────────────────

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Strip CDATA wrapper if present: <![CDATA[...]]>
function stripCdata(value: string): string {
  const match = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return match ? match[1].trim() : value.trim();
}

// Extract all <loc>…</loc> values from raw XML — handles namespaces, CDATA, whitespace
function extractLocValues(xml: string): string[] {
  const matches = Array.from(xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi));
  return matches
    .map((m) => decodeXmlEntities(stripCdata(m[1] ?? "")).trim())
    .filter(Boolean);
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function normalizeUrlSafe(input: string): string | null {
  try {
    return normalizeUrl(input).normalizedUrl;
  } catch {
    return null;
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/xml,text/xml,text/plain,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Core sitemap parser ──────────────────────────────────────────────────────

// Recursively fetch and parse a sitemap URL.
// If it is a sitemap index, fetches child sitemaps (up to depth 2).
async function fetchSitemapRaw(url: string, depth = 0): Promise<string[]> {
  if (depth > 2) return [];

  const xml = await fetchText(url);
  if (!xml || !xml.trim()) return [];

  const locs = extractLocValues(xml);
  if (locs.length === 0) return [];

  if (isSitemapIndex(xml)) {
    // All locs point to child sitemaps — recurse
    const childResults = await Promise.all(
      locs.slice(0, 30).map((childUrl) => fetchSitemapRaw(childUrl, depth + 1)),
    );
    return childResults.flat();
  }

  return locs;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Fetch a sitemap, handle sitemap index recursion, normalize and deduplicate URLs.
// Throws if no valid URLs are found.
export async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const raw = await fetchSitemapRaw(sitemapUrl);
  const normalized = raw
    .map(normalizeUrlSafe)
    .filter((u): u is string => u !== null);

  if (normalized.length === 0) {
    throw new Error("Invalid sitemap: no valid URL entries found.");
  }

  return Array.from(new Set(normalized));
}

// Same as fetchSitemapUrls but returns null instead of throwing — used for fallback chains.
export async function tryFetchSitemapUrls(url: string): Promise<string[] | null> {
  try {
    const urls = await fetchSitemapUrls(url);
    return urls.length > 0 ? urls : null;
  } catch {
    return null;
  }
}

// Extract Sitemap: lines from a robots.txt body.
export function extractSitemapUrlsFromRobots(robotsText: string): string[] {
  return robotsText
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^Sitemap:\s*(.+)$/i);
      return match ? [match[1].trim()] : [];
    })
    .filter(Boolean);
}

// Fetch robots.txt for a domain.
export async function fetchRobotsTxt(domain: string): Promise<string | null> {
  const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return fetchText(`https://${normalized}/robots.txt`);
}
