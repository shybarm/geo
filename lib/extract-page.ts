import { normalizeUrl } from "@/lib/normalize-url";

export type IndexabilityHint = "indexable" | "noindex" | "unknown";

export type PageExtract = {
  finalUrl: string;
  title: string;
  metaDescription: string;
  canonicalHref: string;
  robotsMetaContent: string;
  ogTitle: string;
  ogDescription: string;
  hasJsonLd: boolean;
  schemaTypeHints: string[];
  indexabilityHint: IndexabilityHint;
  canonicalMatchesPage: boolean | null;
  listCount: number;
  tableCount: number;
  hasFaqSchema: boolean;
  hasArticleSchema: boolean;
  hasOrganizationSchema: boolean;
  hasPersonSchema: boolean;
  h1Count: number;
  headingCount: number;
  paragraphCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  textLength: number;
  hasFaqSection: boolean;
  hasAuthorOrReviewer: boolean;
  hasDateOrUpdate: boolean;
};

function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTagContent(html: string, tagName: string): string {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\s\S]*?)<\/${tagName}>`, "i"));
  return match ? match[1].trim() : "";
}

function extractMetaContent(html: string, attrName: "name" | "property", attrValue: string): string {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\$&");
  const first = html.match(new RegExp(`<meta[^>]+${attrName}=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"));
  if (first) return first[1].trim();
  const second = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attrName}=["']${escaped}["'][^>]*>`, "i"));
  return second ? second[1].trim() : "";
}

function extractCanonicalHref(html: string, pageUrl: string): string {
  const patterns = [
    /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;

    try {
      return new URL(match[1].trim(), pageUrl).toString();
    } catch {
      return match[1].trim();
    }
  }

  return "";
}

function countMatches(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

function classifyLinks(html: string, pageUrl: string): { internal: number; external: number } {
  let baseHost = "";
  try {
    baseHost = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    // noop
  }

  let internal = 0;
  let external = 0;
  const hrefPattern = /href=["']([^"'#\s][^"']*?)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];

    if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../")) {
      internal += 1;
      continue;
    }

    if (href.startsWith("http://") || href.startsWith("https://")) {
      try {
        const host = new URL(href).hostname.toLowerCase();
        if (baseHost && host === baseHost) {
          internal += 1;
        } else {
          external += 1;
        }
      } catch {
        external += 1;
      }
    }
  }

  return { internal, external };
}

function collectSchemaTypes(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, into);
    return;
  }

  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const typeValue = record["@type"];

  if (typeof typeValue === "string") {
    into.add(typeValue.trim());
  } else if (Array.isArray(typeValue)) {
    for (const item of typeValue) {
      if (typeof item === "string" && item.trim()) into.add(item.trim());
    }
  }

  for (const child of Object.values(record)) collectSchemaTypes(child, into);
}

function extractSchemaTypeHints(html: string): string[] {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const hints = new Set<string>();

  for (const match of scripts) {
    const content = match[1]?.trim();
    if (!content) continue;

    try {
      const parsed = JSON.parse(content);
      collectSchemaTypes(parsed, hints);
    } catch {
      const lowered = content.toLowerCase();
      if (lowered.includes('faqpage')) hints.add('FAQPage');
      if (lowered.includes('article')) hints.add('Article');
      if (lowered.includes('organization')) hints.add('Organization');
      if (lowered.includes('person')) hints.add('Person');
    }
  }

  return Array.from(hints).sort((a, b) => a.localeCompare(b));
}

function getIndexabilityHint(robotsMetaContent: string): IndexabilityHint {
  const lowered = robotsMetaContent.toLowerCase();
  if (!lowered) return "unknown";
  if (lowered.includes("noindex")) return "noindex";
  if (lowered.includes("index")) return "indexable";
  return "unknown";
}

export function extractPage(html: string, pageUrl: string): PageExtract {
  const lower = html.toLowerCase();
  const visibleText = stripTags(html);
  const visibleLower = visibleText.toLowerCase();

  const title = extractTagContent(html, "title");
  const metaDescription = extractMetaContent(html, "name", "description");
  const canonicalHref = extractCanonicalHref(html, pageUrl);
  const robotsMetaContent = extractMetaContent(html, "name", "robots");
  const ogTitle = extractMetaContent(html, "property", "og:title");
  const ogDescription = extractMetaContent(html, "property", "og:description");
  const schemaTypeHints = extractSchemaTypeHints(html);
  const hasJsonLd = schemaTypeHints.length > 0 || /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
  const indexabilityHint = getIndexabilityHint(robotsMetaContent);

  let canonicalMatchesPage: boolean | null = null;
  if (canonicalHref) {
    try {
      canonicalMatchesPage = normalizeUrl(canonicalHref).normalizedUrl === normalizeUrl(pageUrl).normalizedUrl;
    } catch {
      canonicalMatchesPage = null;
    }
  }

  const h1Count = countMatches(html, /<h1[\s>]/gi);
  const headingCount = countMatches(html, /<h[1-6][\s>]/gi);
  const paragraphCount = countMatches(html, /<p[\s>]/gi);
  const listCount = countMatches(html, /<(ul|ol)[\s>]/gi);
  const tableCount = countMatches(html, /<table[\s>]/gi);

  const { internal: internalLinkCount, external: externalLinkCount } = classifyLinks(html, pageUrl);
  const textLength = visibleText.length;

  const hasFaqSection =
    visibleLower.includes("frequently asked") ||
    visibleLower.includes("faq") ||
    /<[^>]+(class|id|aria-label)=["'][^"']*faq[^"']*["'][^>]*>/i.test(html);

  const hasAuthorOrReviewer =
    visibleLower.includes("written by") ||
    visibleLower.includes("reviewed by") ||
    visibleLower.includes("medically reviewed") ||
    visibleLower.includes("author:") ||
    visibleLower.includes("reviewer:") ||
    visibleLower.includes("fact-checked by") ||
    /<[^>]+(class|rel|itemprop)=["'][^"']*(author|reviewer)[^"']*["'][^>]*>/i.test(html);

  const hasDateOrUpdate =
    visibleLower.includes("last updated") ||
    visibleLower.includes("updated on") ||
    visibleLower.includes("published on") ||
    visibleLower.includes("date published") ||
    visibleLower.includes("posted on") ||
    /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}/i.test(visibleText) ||
    /<time[^>]*(datetime=)[^>]*>/i.test(html);

  const loweredSchemaHints = schemaTypeHints.map((hint) => hint.toLowerCase());

  return {
    finalUrl: pageUrl,
    title,
    metaDescription,
    canonicalHref,
    robotsMetaContent,
    ogTitle,
    ogDescription,
    hasJsonLd,
    schemaTypeHints,
    indexabilityHint,
    canonicalMatchesPage,
    listCount,
    tableCount,
    hasFaqSchema: loweredSchemaHints.includes("faqpage"),
    hasArticleSchema: loweredSchemaHints.includes("article"),
    hasOrganizationSchema: loweredSchemaHints.includes("organization"),
    hasPersonSchema: loweredSchemaHints.includes("person"),
    h1Count,
    headingCount,
    paragraphCount,
    internalLinkCount,
    externalLinkCount,
    textLength,
    hasFaqSection,
    hasAuthorOrReviewer,
    hasDateOrUpdate,
  };
}
