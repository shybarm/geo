"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GEO OS root error]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-red-200 bg-red-50 p-8 text-center shadow-soft">
        <h1 className="text-xl font-semibold text-red-800">Something went wrong</h1>
        <p className="text-sm text-red-700">
          {error.message || "An unexpected error occurred. Check the console for details."}
        </p>
        <button
          onClick={reset}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-red-700 px-4 text-sm font-medium text-white transition hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
