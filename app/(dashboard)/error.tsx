"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GEO OS dashboard error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-red-200 bg-red-50 p-8">
        <h2 className="text-lg font-semibold text-red-800">Page failed to load</h2>
        <p className="text-sm text-red-700">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
        <p className="text-xs text-red-600">
          Common causes: database unavailable, environment variables missing, or an API route
          returning an unexpected response. Check the dev server console for details.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-medium text-white transition hover:bg-red-800"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
