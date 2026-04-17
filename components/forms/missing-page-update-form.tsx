"use client";

import { MissingPageStatus } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type MissingPageUpdateFormProps = {
  opportunity: {
    id: string;
    proposedTitle: string | null;
    proposedSlug: string | null;
    pageType: string | null;
    status: string;
  };
};

const statuses = Object.values(MissingPageStatus);

export function MissingPageUpdateForm({ opportunity }: MissingPageUpdateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(opportunity.status as MissingPageStatus);
  const [proposedTitle, setProposedTitle] = useState(opportunity.proposedTitle ?? "");
  const [proposedSlug, setProposedSlug] = useState(opportunity.proposedSlug ?? "");
  const [pageType, setPageType] = useState(opportunity.pageType ?? "");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/missing-page-opportunities/${opportunity.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          proposedTitle: proposedTitle || null,
          proposedSlug: proposedSlug || null,
          pageType: pageType || null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to update missing page opportunity.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <select
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
          onChange={(event) => setStatus(event.target.value as MissingPageStatus)}
          value={status}
        >
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
          onChange={(event) => setProposedTitle(event.target.value)}
          placeholder="Proposed title"
          value={proposedTitle}
        />
        <input
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
          onChange={(event) => setProposedSlug(event.target.value)}
          placeholder="Proposed slug"
          value={proposedSlug}
        />
        <div className="flex gap-2">
          <input
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
            onChange={(event) => setPageType(event.target.value)}
            placeholder="Page type"
            value={pageType}
          />
          <button
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
