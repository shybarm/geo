"use client";

import { EntitySignalType } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type EntityRecord = {
  id: string;
  name: string;
  entityType: string;
};

type PageEntitySignalFormProps = {
  pageId: string;
  pageVersionId: string | null;
  entities: EntityRecord[];
};

const signalTypes = Object.values(EntitySignalType);

export function PageEntitySignalForm({ entities, pageId, pageVersionId }: PageEntitySignalFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [signalType, setSignalType] = useState<EntitySignalType>(EntitySignalType.AUTHOR);
  const [visibilityScore, setVisibilityScore] = useState("0");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/pages/${pageId}/entity-signals`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageVersionId,
          entityId,
          signalType,
          visibilityScore,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Failed to create entity signal.");
        return;
      }

      setVisibilityScore("0");
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-5 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Create Entity Signal</h2>
        <p className="text-sm text-muted-foreground">Persist a real entity visibility signal for this page.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Entity</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setEntityId(event.target.value)}
              required
              value={entityId}
            >
              <option value="">Select entity</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Signal Type</span>
            <select
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setSignalType(event.target.value as EntitySignalType)}
              required
              value={signalType}
            >
              {signalTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Visibility Score</span>
            <input
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-foreground/30"
              onChange={(event) => setVisibilityScore(event.target.value)}
              required
              type="number"
              value={visibilityScore}
            />
          </label>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end">
          <button
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || entities.length === 0}
            type="submit"
          >
            {isPending ? "Creating..." : "Create entity signal"}
          </button>
        </div>
      </form>
    </section>
  );
}
