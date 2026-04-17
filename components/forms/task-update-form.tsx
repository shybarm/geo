"use client";

import { TaskPriority, TaskStatus } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TaskUpdateFormProps = {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
  };
};

const statuses = Object.values(TaskStatus);
const priorities = Object.values(TaskPriority);

function toDateInputValue(value: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export function TaskUpdateForm({ task }: TaskUpdateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [status, setStatus] = useState(task.status as TaskStatus);
  const [priority, setPriority] = useState(task.priority as TaskPriority);
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");

  function submitUpdate(payload: {
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string | null;
    title?: string;
    description?: string | null;
  }) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "Failed to update task.");
        return;
      }

      router.refresh();
    });
  }

  function handleQuickSave() {
    submitUpdate({
      status,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    });
  }

  function handleDetailsSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitUpdate({
      title,
      description: description || null,
      status,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">Status</span>
          <select
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">Priority</span>
          <select
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
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
        <label className="space-y-1">
          <span className="text-xs font-medium text-foreground">Due date</span>
          <input
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
            onChange={(event) => setDueDate(event.target.value)}
            type="date"
            value={dueDate}
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            onClick={handleQuickSave}
            type="button"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-secondary"
            onClick={() => setIsExpanded((open) => !open)}
            type="button"
          >
            {isExpanded ? "Hide" : "Edit"}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <form className="space-y-3 rounded-xl border border-border bg-background p-4" onSubmit={handleDetailsSave}>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Title</span>
            <input
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Description</span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Saving..." : "Save details"}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
