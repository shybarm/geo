export type NormalizedUrl = {
  normalizedUrl: string;
  canonicalUrl: string;
  pathname: string;
  slug: string;
};

function normalizePathname(pathname: string) {
  const cleaned = pathname.replace(/\/+/g, "/") || "/";

  if (cleaned !== "/" && cleaned.endsWith("/")) {
    return cleaned.slice(0, -1);
  }

  return cleaned || "/";
}

function getSlug(pathname: string) {
  if (pathname === "/") {
    return "home";
  }

  const segments = pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? "home";
}

export function normalizeUrl(input: string): NormalizedUrl {
  const url = new URL(input);

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  url.pathname = normalizePathname(url.pathname || "/");
  url.search = "";

  const canonicalUrl = url.toString();

  return {
    normalizedUrl: canonicalUrl,
    canonicalUrl,
    pathname: url.pathname,
    slug: getSlug(url.pathname),
  };
}
