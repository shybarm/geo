"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DraftMode = "structured_enhancement" | "rewrite" | "implementation_prep";

type GenerateResult = {
  page: { id: string; title: string | null; path: string };
  draft: { id: string; createdAt: string };
  linkedRecommendationIds: string[];
};

const MODE_OPTIONS: { value: DraftMode; label: string; description: string }[] = [
  {
    value: "structured_enhancement",
    label: "Structured Enhancement",
    description: "Improve sections, trust signals, and extractability gaps",
  },
  {
    value: "rewrite",
    label: "Rewrite",
    description: "Full content overhaul — answer block, section hierarchy, and authority",
  },
  {
    value: "implementation_prep",
    label: "Implementation Prep",
    description: "Actionable notes and quick wins for your content team",
  },
];

export function GenerateDraftForm({
  pageId,
  activeRecommendationCount,
}: {
  pageId: string;
  activeRecommendationCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<DraftMode>("structured_enhancement");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await fetch(
        `/api/pages/${pageId}/generate-draft-from-recommendations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(payload?.error?.message ?? "Failed to generate draft.");
        return;
      }

      const data = (await response.json()) as GenerateResult;
      setResult(data);
      router.refresh();
    });
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-800">Draft plan generated</p>
          <p className="mt-1 text-sm text-emerald-700">
            {result.linkedRecommendationIds.length} recommendation
            {result.linkedRecommendationIds.length !== 1 ? "s" : ""} linked and moved to
            draft status. Scroll down to review the plan.
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            Applying the draft remains a separate action — this plan is not published.
          </p>
        </div>
        <button
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setResult(null)}
          type="button"
        >
          Generate another draft
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <p className="text-sm text-foreground">
        <span className="font-semibold">{activeRecommendationCount}</span> active
        recommendation{activeRecommendationCount !== 1 ? "s" : ""} ready to convert into a
        draft plan.
      </p>

      <div className="space-y-2">
        {MODE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
              mode === opt.value
                ? "border-foreground/30 bg-secondary"
                : "border-border bg-background hover:bg-secondary/60"
            }`}
          >
            <input
              checked={mode === opt.value}
              className="mt-0.5 shrink-0"
              disabled={isPending}
              onChange={() => setMode(opt.value)}
              type="radio"
              value={opt.value}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.description}</p>
            </div>
          </label>
        ))}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Generating draft plan…" : "Generate draft from recommendations"}
      </button>
    </form>
  );
}
