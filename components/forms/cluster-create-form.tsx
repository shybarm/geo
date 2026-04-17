"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Workspace = {
  id: string;
  name: string;
};

type ClusterCreateFormProps = {
  workspaces: Workspace[];
};

export function ClusterCreateForm({ workspaces }: ClusterCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/clusters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          name,
          topic,
          ownerUserId: ownerUserId || null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to create cluster.");
        return;
      }

      setName("");
      setTopic("");
      setOwnerUserId("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Create Cluster</h2>
        <p className="text-sm text-muted-foreground">Group pages under a shared topic.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 xl:col-span-1">
            <span className="text-sm font-medium text-foreground">Workspace</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setWorkspaceId(event.target.value)}
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
          <label className="space-y-2 xl:col-span-1">
            <span className="text-sm font-medium text-foreground">Name</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="space-y-2 xl:col-span-1">
            <span className="text-sm font-medium text-foreground">Topic</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setTopic(event.target.value)}
              required
              value={topic}
            />
          </label>
          <label className="space-y-2 xl:col-span-1">
            <span className="text-sm font-medium text-foreground">Owner User ID</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setOwnerUserId(event.target.value)}
              value={ownerUserId}
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
            {isPending ? "Creating..." : "Create cluster"}
          </button>
        </div>
      </form>
    </section>
  );
}
