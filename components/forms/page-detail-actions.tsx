"use client";

import { PageVersionState } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DraftVersion = {
  id: string;
  title: string | null;
  metaDescription: string | null;
  createdAt: string;
  createdBy: string | null;
  contentState: string;
  extractedJson: unknown;
};

type VersionRecord = {
  id: string;
  title: string | null;
  metaDescription: string | null;
  createdAt: string;
  createdBy: string | null;
  contentState: string;
  extractedJson: unknown;
};

type PageDetailActionsProps = {
  workspaceId: string;
  pageId: string;
  drafts: DraftVersion[];
  versions: VersionRecord[];
};

function isValidJson(value: string) {
  if (!value.trim()) return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function PageDetailActions({ drafts, pageId, versions, workspaceId }: PageDetailActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const latestDraft = drafts[0] ?? null;
  const [draftTitle, setDraftTitle] = useState(latestDraft?.title ?? "");
  const [draftMetaDescription, setDraftMetaDescription] = useState(latestDraft?.metaDescription ?? "");
  const [draftContent, setDraftContent] = useState(
    latestDraft?.extractedJson ? JSON.stringify(latestDraft.extractedJson, null, 2) : "",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const jsonValid = isValidJson(draftContent);

  function runAction(path: string, body?: unknown) {
    startTransition(async () => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Action failed.");
        return;
      }

      setError(null);
      router.refresh();
    });
  }

  function handleCreateDraft() {
    runAction(`/api/pages/${pageId}/drafts`);
  }

  function handleUpdateDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!latestDraft) {
      setError("Create a draft first.");
      return;
    }

    if (!jsonValid) {
      setError("Content JSON is invalid. Fix the syntax before saving.");
      return;
    }

    let extractedJson: unknown = null;
    if (draftContent.trim()) {
      try {
        extractedJson = JSON.parse(draftContent);
      } catch {
        extractedJson = draftContent;
      }
    }

    startTransition(async () => {
      const response = await fetch(`/api/page-versions/${latestDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle || null,
          metaDescription: draftMetaDescription || null,
          extractedJson,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Action failed.");
        return;
      }

      setError(null);
      router.refresh();
    });
  }

  const workflowSteps = [
    {
      label: "Create draft",
      description: "Start a draft copy of the current live version.",
      action: handleCreateDraft,
      disabled: isPending,
      primary: true,
    },
    {
      label: "Apply latest draft",
      description: "Promote the draft to live.",
      action: () => latestDraft && runAction(`/api/pages/${pageId}/apply-draft`, { pageVersionId: latestDraft.id }),
      disabled: isPending || !latestDraft,
      primary: false,
    },
    {
      label: "Verify live route",
      description: "Confirm the live URL is reachable.",
      action: () => runAction(`/api/pages/${pageId}/verify-route`),
      disabled: isPending,
      primary: false,
    },
    {
      label: "Rescan page",
      description: "Fetch the live page and compute a new score.",
      action: () => runAction("/api/scans", { workspaceId, pageId }),
      disabled: isPending,
      primary: false,
    },
    {
      label: "Reconcile recommendations",
      description: "Refresh the active recommendation set from latest findings.",
      action: () => runAction("/api/recommendations/reconcile", { workspaceId, pageId }),
      disabled: isPending,
      primary: false,
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {/* Workflow actions */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Workflow Actions</h2>
          <p className="text-sm text-muted-foreground">Run steps in order: create → edit → apply → verify → scan → reconcile.</p>
        </div>
        <ol className="space-y-3">
          {workflowSteps.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <button
                className={`shrink-0 inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  step.primary
                    ? "bg-primary text-primary-foreground hover:opacity-95"
                    : "border border-border bg-background text-foreground hover:bg-secondary"
                }`}
                disabled={step.disabled}
                onClick={step.action}
                type="button"
              >
                {step.label}
              </button>
            </li>
          ))}
        </ol>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>

      {/* Draft editor */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Edit Latest Draft</h2>
          <p className="text-sm text-muted-foreground">Update the draft before applying it to live.</p>
        </div>
        {!latestDraft ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No draft available</p>
            <p className="mt-2 text-sm text-muted-foreground">Create a draft using the workflow panel.</p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleUpdateDraft}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Title</span>
              <input
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
                onChange={(e) => setDraftTitle(e.target.value)}
                value={draftTitle}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-foreground">Meta Description</span>
              <textarea
                className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-foreground/30"
                onChange={(e) => setDraftMetaDescription(e.target.value)}
                value={draftMetaDescription}
              />
            </label>

            {/* Advanced: raw JSON */}
            <div className="rounded-xl border border-border">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
                onClick={() => setShowAdvanced((v) => !v)}
                type="button"
              >
                <span>Advanced — Content JSON</span>
                <span className="flex items-center gap-2">
                  {draftContent.trim() && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        jsonValid
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {jsonValid ? "Valid JSON" : "Invalid JSON"}
                    </span>
                  )}
                  <span className="text-muted-foreground">{showAdvanced ? "▲" : "▼"}</span>
                </span>
              </button>
              {showAdvanced && (
                <div className="border-t border-border px-4 pb-4 pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Raw extracted content stored on this version. Edit with care — invalid JSON will block saving.
                  </p>
                  <textarea
                    className={`min-h-48 w-full rounded-xl border bg-background px-3 py-2 font-mono text-xs outline-none transition focus:border-foreground/30 ${
                      !jsonValid && draftContent.trim()
                        ? "border-red-400 focus:border-red-500"
                        : "border-border"
                    }`}
                    onChange={(e) => setDraftContent(e.target.value)}
                    value={draftContent}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending || (!jsonValid && draftContent.trim().length > 0)}
                type="submit"
              >
                Save draft changes
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Version history */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft xl:col-span-2">
        <div className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Version History</h2>
          <p className="text-sm text-muted-foreground">Live and draft versions for this page.</p>
        </div>
        {versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No versions available</p>
            <p className="mt-2 text-sm text-muted-foreground">This page has no persisted versions yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {versions.map((version) => {
              const isDraft = version.contentState === PageVersionState.DRAFT;
              return (
                <div
                  key={version.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs text-muted-foreground">{version.id}</p>
                      <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                        {version.contentState}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{version.title || "Untitled version"}</p>
                    <p className="text-xs text-muted-foreground">
                      Created by {version.createdBy || "unknown"} on{" "}
                      {new Intl.DateTimeFormat("en", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(version.createdAt))}
                    </p>
                  </div>
                  {isDraft ? (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isPending}
                      onClick={() => runAction(`/api/pages/${pageId}/apply-draft`, { pageVersionId: version.id })}
                      type="button"
                    >
                      Apply draft
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
