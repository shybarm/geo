"use client";

import { TaskPriority } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RecommendationTaskFormProps = {
  workspaceId: string;
  linkedPageId: string | null;
  linkedRecommendationId: string;
  defaultTitle: string;
};

const priorities = Object.values(TaskPriority);

export function RecommendationTaskForm({
  workspaceId,
  linkedPageId,
  linkedRecommendationId,
  defaultTitle,
}: RecommendationTaskFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          linkedPageId,
          linkedRecommendationId,
          title,
          description: description || null,
          priority,
          ownerUserId: ownerUserId || null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Failed to create task.");
        return;
      }

      setDescription("");
      setOwnerUserId("");
      setDueDate("");
      setPriority(TaskPriority.MEDIUM);
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      {!isOpen ? (
        <button
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-secondary"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          Create Task
        </button>
      ) : (
        <form className="space-y-3 rounded-xl border border-border bg-background p-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-xs font-medium text-foreground">Title</span>
            <input
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-medium text-foreground">Description</span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-medium text-foreground">Priority</span>
              <select
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition focus:border-foreground/30"
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                value={priority}
              >
                {priorities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-foreground">Owner User ID</span>
              <input
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition focus:border-foreground/30"
                onChange={(event) => setOwnerUserId(event.target.value)}
                value={ownerUserId}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-medium text-foreground">Due Date</span>
              <input
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition focus:border-foreground/30"
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                value={dueDate}
              />
            </label>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Creating..." : "Save Task"}
            </button>
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-secondary"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
