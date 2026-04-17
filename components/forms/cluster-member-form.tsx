"use client";

import { ClusterMembershipRole } from "@prisma/client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PageRecord = {
  id: string;
  title: string | null;
  path: string;
};

type ClusterMemberFormProps = {
  clusterId: string;
  pages: PageRecord[];
};

const membershipRoles = Object.values(ClusterMembershipRole);

export function ClusterMemberForm({ clusterId, pages }: ClusterMemberFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [role, setRole] = useState<ClusterMembershipRole>(ClusterMembershipRole.SUPPORTING);

  const pageOptions = useMemo(() => pages, [pages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/clusters/${clusterId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageId,
          role,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to add cluster member.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Add Member</h2>
        <p className="text-sm text-muted-foreground">Attach an existing page to this cluster.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Page</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setPageId(event.target.value)}
              required
              value={pageId}
            >
              <option value="">Select page</option>
              {pageOptions.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title?.trim() || page.path}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Role</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setRole(event.target.value as ClusterMembershipRole)}
              required
              value={role}
            >
              {membershipRoles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || pageOptions.length === 0}
            type="submit"
          >
            {isPending ? "Adding..." : "Add member"}
          </button>
        </div>
      </form>
    </section>
  );
}
