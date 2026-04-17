import { headers } from "next/headers";

function getFallbackBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
}

export async function getApiBaseUrl() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  if (!host) {
    return getFallbackBaseUrl();
  }

  return `${protocol}://${host}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = await getApiBaseUrl();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      cache: "no-store",
    });
  } catch (cause) {
    const err = new Error(
      `Network error fetching ${path} — is the dev server running and the database reachable?`,
    ) as Error & { status?: number; cause?: unknown };
    err.cause = cause;
    throw err;
  }

  if (!response.ok) {
    const error = new Error(
      `API request failed: ${response.status} ${response.statusText} (${path})`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}
