export type FetchPageSuccess = {
  ok: true;
  html: string;
  finalUrl: string;
  statusCode: number;
};

export type FetchPageFailure = {
  ok: false;
  statusCode: number;
  failureCode: string;
  errorMessage: string;
};

export type FetchPageResult = FetchPageSuccess | FetchPageFailure;

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchPage(url: string): Promise<FetchPageResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "GeoOS-Scanner/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      message.toLowerCase().includes("timeout") ||
      (err instanceof Error && err.name === "TimeoutError") ||
      (err instanceof Error && err.name === "AbortError");

    return {
      ok: false,
      statusCode: 0,
      failureCode: isTimeout ? "FETCH_TIMEOUT" : "FETCH_ERROR",
      errorMessage: message,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      statusCode: response.status,
      failureCode: `HTTP_${response.status}`,
      errorMessage: `Page returned HTTP ${response.status}`,
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return {
      ok: false,
      statusCode: response.status,
      failureCode: "NOT_HTML",
      errorMessage: `Response content-type is not HTML: ${contentType}`,
    };
  }

  let html: string;
  try {
    html = await response.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      statusCode: response.status,
      failureCode: "READ_ERROR",
      errorMessage: message,
    };
  }

  return {
    ok: true,
    html,
    finalUrl: response.url || url,
    statusCode: response.status,
  };
}
