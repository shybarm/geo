"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Workspace = {
  id: string;
  name: string;
};

type Site = {
  id: string;
  workspaceId: string;
  domain: string;
};

type PageCreateFormProps = {
  workspaces: Workspace[];
  sites: Site[];
};

type FormState = {
  workspaceId: string;
  siteId: string;
  url: string;
  canonicalUrl: string;
  path: string;
  slug: string;
  title: string;
  pageType: string;
};

const initialState: FormState = {
  workspaceId: "",
  siteId: "",
  url: "",
  canonicalUrl: "",
  path: "",
  slug: "",
  title: "",
  pageType: "",
};

export function PageCreateForm({ workspaces, sites }: PageCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => {
    const workspaceId = workspaces[0]?.id ?? "";
    const siteId = sites.find((site) => site.workspaceId === workspaceId)?.id ?? "";

    return {
      ...initialState,
      workspaceId,
      siteId,
    };
  });

  const availableSites = useMemo(
    () => sites.filter((site) => site.workspaceId === form.workspaceId),
    [form.workspaceId, sites],
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };

      if (key === "workspaceId") {
        const nextSiteId = sites.find((site) => site.workspaceId === value)?.id ?? "";
        next.siteId = nextSiteId;
      }

      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: form.workspaceId,
          siteId: form.siteId,
          url: form.url,
          canonicalUrl: form.canonicalUrl || null,
          path: form.path,
          slug: form.slug,
          title: form.title || null,
          pageType: form.pageType || null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Failed to create page.");
        return;
      }

      setForm({
        ...initialState,
        workspaceId: form.workspaceId,
        siteId: sites.find((site) => site.workspaceId === form.workspaceId)?.id ?? "",
      });
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Create Page</h2>
        <p className="text-sm text-muted-foreground">Add a page to the registry.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Workspace">
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("workspaceId", event.target.value)}
              required
              value={form.workspaceId}
            >
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Site">
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("siteId", event.target.value)}
              required
              value={form.siteId}
            >
              <option value="">Select site</option>
              {availableSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.domain}
                </option>
              ))}
            </select>
          </Field>
          <Field label="URL">
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("url", event.target.value)}
              required
              type="url"
              value={form.url}
            />
          </Field>
          <Field label="Canonical URL">
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("canonicalUrl", event.target.value)}
              type="url"
              value={form.canonicalUrl}
            />
          </Field>
          <Field label="Path">
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("path", event.target.value)}
              required
              value={form.path}
            />
          </Field>
          <Field label="Slug">
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("slug", event.target.value)}
              required
              value={form.slug}
            />
          </Field>
          <Field label="Title">
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("title", event.target.value)}
              value={form.title}
            />
          </Field>
          <Field label="Page Type">
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => updateField("pageType", event.target.value)}
              value={form.pageType}
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Creating..." : "Create page"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
