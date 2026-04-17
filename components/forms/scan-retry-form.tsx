"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ScanRetryFormProps = {
  scanId: string;
};

export function ScanRetryForm({ scanId }: ScanRetryFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/scans/${scanId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? "Failed to retry scan.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <form className="space-y-2" onSubmit={handleSubmit}>
      <button
        className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Retrying..." : "Retry"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
