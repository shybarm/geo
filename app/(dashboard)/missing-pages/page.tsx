import Link from "next/link";

import { MissingPageCreateDraftForm } from "@/components/forms/missing-page-create-draft-form";
import { MissingPageUpdateForm } from "@/components/forms/missing-page-update-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type MissingPageRecord = {
  id: string;
  proposedTitle: string | null;
  proposedSlug: string | null;
  pageType: string | null;
  status: string;
  rationale: string | null;
  createdAt: string;
  cluster: {
    id: string;
    name: string;
  } | null;
  page: {
    id: string;
    path: string;
  } | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function MissingPagesRoute() {
  const opportunities = await apiFetch<MissingPageRecord[]>("/api/missing-page-opportunities");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Missing Pages</h1>
        <p className="text-sm text-muted-foreground">Queue for missing page opportunities discovered across clusters and review work.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Opportunity Queue</h2>
        </div>

        {opportunities.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">No missing page opportunities yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create one from a cluster to start tracking content gaps.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {opportunities.map((opportunity) => (
              <div key={opportunity.id} className="px-6 py-6">
                <div className="mb-4 grid gap-3 xl:grid-cols-[1.3fr_0.7fr_0.7fr_0.8fr_0.8fr_0.8fr]">
                  <div>
                    <p className="text-sm font-medium text-foreground">{opportunity.proposedTitle || "Untitled opportunity"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{opportunity.rationale || "No rationale recorded."}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">{opportunity.proposedSlug || "-"}</div>
                  <div className="text-sm text-muted-foreground">{opportunity.pageType || "-"}</div>
                  <div>
                    <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                      {opportunity.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">{opportunity.cluster?.name ?? "-"}</div>
                  <div className="text-sm text-muted-foreground">{opportunity.page?.path ?? "-"}</div>
                </div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Created {formatDate(opportunity.createdAt)}</span>
                  {opportunity.page ? (
                    <Link className="font-medium text-foreground underline-offset-4 transition hover:underline" href={`/pages/${opportunity.page.id}`}>
                      {opportunity.page.path}
                    </Link>
                  ) : null}
                </div>
                <div className="space-y-4">
                  <MissingPageCreateDraftForm opportunity={opportunity} />
                  <MissingPageUpdateForm opportunity={opportunity} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
