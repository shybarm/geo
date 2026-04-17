"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Workspace = {
  id: string;
  name: string;
};

type Page = {
  id: string;
  workspaceId: string;
  title: string | null;
  path: string;
};

type ScanTriggerFormProps = {
  workspaces: Workspace[];
  pages: Page[];
};

export function ScanTriggerForm({ workspaces, pages }: ScanTriggerFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [pageId, setPageId] = useState(() => pages.find((page) => page.workspaceId === workspaces[0]?.id)?.id ?? "");

  const availablePages = useMemo(
    () => pages.filter((page) => page.workspaceId === workspaceId),
    [pages, workspaceId],
  );

  function handleWorkspaceChange(nextWorkspaceId: string) {
    setWorkspaceId(nextWorkspaceId);
    setPageId(pages.find((page) => page.workspaceId === nextWorkspaceId)?.id ?? "");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId, pageId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Failed to run scan.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Run Scan</h2>
        <p className="text-sm text-muted-foreground">Create a scan and score snapshot for a page with a live version.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Workspace</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => handleWorkspaceChange(event.target.value)}
              required
              value={workspaceId}
            >
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Page</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setPageId(event.target.value)}
              required
              value={pageId}
            >
              <option value="">Select page</option>
              {availablePages.map((page) => (
                <option key={page.id} value={page.id}>
                  {(page.title?.trim() || page.path) + " · " + page.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Running..." : "Run scan"}
          </button>
        </div>
      </form>
    </section>
  );
}
