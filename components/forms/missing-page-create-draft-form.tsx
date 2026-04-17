"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type MissingPageCreateDraftFormProps = {
  opportunity: {
    id: string;
    page: {
      id: string;
      path: string;
    } | null;
  };
};

export function MissingPageCreateDraftForm({ opportunity }: MissingPageCreateDraftFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCreateDraft() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/missing-page-opportunities/${opportunity.id}/create-draft`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to create draft page.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || Boolean(opportunity.page)}
          onClick={handleCreateDraft}
          type="button"
        >
          {opportunity.page ? "Draft Page Created" : isPending ? "Creating..." : "Create Draft Page"}
        </button>
        {opportunity.page ? (
          <Link className="text-sm font-medium text-foreground underline-offset-4 transition hover:underline" href={`/pages/${opportunity.page.id}`}>
            Open page
          </Link>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
