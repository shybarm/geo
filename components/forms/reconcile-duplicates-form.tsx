"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  workspaceId: string;
  primaryPageId: string;
  duplicatePageIds: string[];
  primaryPath: string;
};

export function ReconcileDuplicatesForm({
  workspaceId,
  primaryPageId,
  duplicatePageIds,
  primaryPath,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function handleReconcile() {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/pages/duplicates/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, primaryPageId, duplicatePageIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error ?? "Reconcile failed.");
        return;
      }
      setStatus("success");
      setMessage(
        `Archived ${data.reconciledCount} duplicate${data.reconciledCount !== 1 ? "s" : ""}. Primary: ${primaryPath}`,
      );
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Network error — could not complete reconcile.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      ) : null}
      <button
        onClick={handleReconcile}
        disabled={status === "loading"}
        className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-4 text-sm font-medium text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
      >
        {status === "loading" ? "Archiving…" : `Archive ${duplicatePageIds.length} duplicate${duplicatePageIds.length !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
