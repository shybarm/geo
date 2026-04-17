"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type MissingPageOpportunityFormProps = {
  workspaceId: string;
  clusterId?: string;
};

export function MissingPageOpportunityForm({ clusterId, workspaceId }: MissingPageOpportunityFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [proposedTitle, setProposedTitle] = useState("");
  const [proposedSlug, setProposedSlug] = useState("");
  const [pageType, setPageType] = useState("");
  const [rationale, setRationale] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/missing-page-opportunities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          clusterId: clusterId ?? null,
          proposedTitle,
          proposedSlug,
          pageType,
          rationale,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to create missing page opportunity.");
        return;
      }

      setProposedTitle("");
      setProposedSlug("");
      setPageType("");
      setRationale("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Create Missing Page Opportunity</h2>
        <p className="text-sm text-muted-foreground">Track a gap in cluster coverage.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Proposed Title</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setProposedTitle(event.target.value)}
              required
              value={proposedTitle}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Proposed Slug</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setProposedSlug(event.target.value)}
              required
              value={proposedSlug}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">Page Type</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setPageType(event.target.value)}
              required
              value={pageType}
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium text-foreground">Rationale</span>
            <textarea
              className="min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setRationale(event.target.value)}
              required
              value={rationale}
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Creating..." : "Create opportunity"}
          </button>
        </div>
      </form>
    </section>
  );
}
