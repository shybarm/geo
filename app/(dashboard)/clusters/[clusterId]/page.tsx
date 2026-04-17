import Link from "next/link";
import { notFound } from "next/navigation";

import { ClusterMemberForm } from "@/components/forms/cluster-member-form";
import { MissingPageOpportunityForm } from "@/components/forms/missing-page-opportunity-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type ClusterDetail = {
  id: string;
  workspaceId: string;
  name: string;
  topic: string | null;
  ownerUserId: string | null;
  createdAt: string;
  memberships: Array<{
    id: string;
    role: string;
    source: string;
    createdAt: string;
    page: {
      id: string;
      title: string | null;
      path: string;
    };
  }>;
  missingPageOpportunities: Array<{
    id: string;
    proposedTitle: string | null;
    proposedSlug: string | null;
    pageType: string | null;
    rationale: string | null;
    status: string;
    createdAt: string;
  }>;
};

type ClusterHealthPage = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: string;
  latestOverallScore: number | null;
  blockersCount: number;
  internalLinkCount?: number | null;
  latestSuccessfulScanCompletedAt?: string | null;
  freshnessReason?: string;
};

type ClusterHealth = {
  clusterId: string;
  clusterName: string;
  topic: string | null;
  totalPages: number;
  pillarCount: number;
  supportingCount: number;
  missingCount: number;
  weakCount: number;
  scannedPagesCount: number;
  unscannedPagesCount: number;
  averageOverallScore: number | null;
  lowScorePages: ClusterHealthPage[];
  pagesWithBlockers: ClusterHealthPage[];
  weaklyLinkedPages: ClusterHealthPage[];
  missingPageOpportunities: Array<{
    id: string;
    proposedTitle: string | null;
    proposedSlug: string | null;
    pageType: string | null;
    rationale: string | null;
    status: string;
    createdAt: string;
    page: {
      id: string;
      path: string;
    } | null;
  }>;
  freshnessIssues: ClusterHealthPage[];
  healthStatus: string;
  healthReasons: string[];
};

type PageRecord = {
  id: string;
  title: string | null;
  path: string;
};

type RouteProps = {
  params: Promise<{
    clusterId: string;
  }>;
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

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toFixed(2);
}

function healthBadgeClass(status: string) {
  if (status === "Healthy") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "Weak") return "border-red-300 bg-red-50 text-red-700";
  return "border-amber-300 bg-amber-50 text-amber-700";
}

function PageList({ emptyBody, pages, renderMeta, title }: {
  emptyBody: string;
  pages: ClusterHealthPage[];
  renderMeta?: (page: ClusterHealthPage) => string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {pages.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-muted-foreground">{emptyBody}</div>
      ) : (
        <div className="divide-y divide-border">
          {pages.map((page) => (
            <div key={page.id} className="px-6 py-4">
              <Link className="text-sm font-medium text-foreground transition hover:text-muted-foreground" href={`/pages/${page.id}`}>
                {page.title?.trim() || page.path}
              </Link>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{page.path}</p>
              <p className="mt-2 text-xs text-muted-foreground">{renderMeta ? renderMeta(page) : `Updated ${formatDate(page.updatedAt)}`}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ClusterDetailPage({ params }: RouteProps) {
  const { clusterId } = await params;

  let cluster: ClusterDetail;
  let health: ClusterHealth;

  try {
    [cluster, health] = await Promise.all([
      apiFetch<ClusterDetail>(`/api/clusters/${clusterId}`),
      apiFetch<ClusterHealth>(`/api/clusters/${clusterId}/health`),
    ]);
  } catch (error) {
    if (typeof error === "object" && error !== null && "status" in error && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const pages = await apiFetch<PageRecord[]>(`/api/pages?workspaceId=${cluster.workspaceId}`);
  const memberPageIds = new Set(cluster.memberships.map((membership) => membership.page.id));
  const availablePages = pages.filter((page) => !memberPageIds.has(page.id));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link className="text-sm text-muted-foreground transition hover:text-foreground" href="/clusters">
          Back to clusters
        </Link>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{cluster.name}</h1>
            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${healthBadgeClass(health.healthStatus)}`}>
              {health.healthStatus}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{cluster.topic || "No topic set"}</p>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard label="Topic" value={cluster.topic || "-"} />
        <DetailCard label="Owner User ID" value={cluster.ownerUserId ?? "-"} mono />
        <DetailCard label="Memberships" value={String(cluster.memberships.length)} />
        <DetailCard label="Missing Opportunities" value={String(cluster.missingPageOpportunities.length)} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Cluster Health</h2>
            <p className="mt-1 text-sm text-muted-foreground">Real health from stored page coverage, scan freshness, blockers, and linking signals.</p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${healthBadgeClass(health.healthStatus)}`}>
            {health.healthStatus}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailCard label="Total pages" value={String(health.totalPages)} />
          <DetailCard label="Scanned / unscanned" value={`${health.scannedPagesCount} / ${health.unscannedPagesCount}`} />
          <DetailCard label="Average score" value={formatScore(health.averageOverallScore)} />
          <DetailCard label="Missing pages" value={String(health.missingPageOpportunities.length)} />
          <DetailCard label="Weak pages" value={String(health.lowScorePages.length)} />
          <DetailCard label="Blockers" value={String(health.pagesWithBlockers.length)} />
          <DetailCard label="Weakly linked" value={String(health.weaklyLinkedPages.length)} />
          <DetailCard label="Freshness issues" value={String(health.freshnessIssues.length)} />
        </div>
        {health.healthReasons.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {health.healthReasons.map((reason) => (
              <span key={reason} className="inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                {reason}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ClusterMemberForm clusterId={cluster.id} pages={availablePages} />
        <MissingPageOpportunityForm clusterId={cluster.id} workspaceId={cluster.workspaceId} />
      </div>

      <section className="grid gap-6 xl:grid-cols-2">
        <PageList
          title="Low score pages"
          pages={health.lowScorePages}
          emptyBody="No low-score pages in this cluster."
          renderMeta={(page) => `Score ${formatScore(page.latestOverallScore)} · Updated ${formatDate(page.updatedAt)}`}
        />
        <PageList
          title="Pages with blockers"
          pages={health.pagesWithBlockers}
          emptyBody="No blockers in this cluster right now."
          renderMeta={(page) => `${page.blockersCount} blocker${page.blockersCount === 1 ? "" : "s"} · Score ${formatScore(page.latestOverallScore)}`}
        />
        <PageList
          title="Weakly linked pages"
          pages={health.weaklyLinkedPages}
          emptyBody="No weakly linked pages detected."
          renderMeta={(page) => `${page.internalLinkCount ?? 0} internal links · Updated ${formatDate(page.updatedAt)}`}
        />
        <PageList
          title="Freshness issues"
          pages={health.freshnessIssues}
          emptyBody="No freshness issues detected."
          renderMeta={(page) => page.freshnessReason ?? (page.latestSuccessfulScanCompletedAt ? `Last scanned ${formatDate(page.latestSuccessfulScanCompletedAt)}` : "Never scanned")}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Memberships</h2>
          </div>
          {cluster.memberships.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="text-base font-medium text-foreground">No members yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Add a page to start building this cluster.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cluster.memberships.map((membership) => (
                <div key={membership.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                      {membership.role}
                    </span>
                    <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {membership.source}
                    </span>
                  </div>
                  <Link className="mt-3 block text-sm font-medium text-foreground transition hover:text-muted-foreground" href={`/pages/${membership.page.id}`}>
                    {membership.page.title?.trim() || membership.page.path}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{membership.page.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Added {formatDate(membership.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold tracking-tight">Missing Page Opportunities</h2>
          </div>
          {health.missingPageOpportunities.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <h3 className="text-base font-medium text-foreground">No missing page opportunities yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Create an opportunity to track a coverage gap.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {health.missingPageOpportunities.map((opportunity) => (
                <div key={opportunity.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                      {opportunity.status}
                    </span>
                    <span className="inline-flex rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {opportunity.pageType || "-"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{opportunity.proposedTitle || "Untitled opportunity"}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{opportunity.proposedSlug || "-"}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{opportunity.rationale || "No rationale recorded."}</p>
                  {opportunity.page ? (
                    <Link className="mt-2 inline-flex text-xs font-medium text-foreground underline-offset-4 transition hover:underline" href={`/pages/${opportunity.page.id}`}>
                      {opportunity.page.path}
                    </Link>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">Created {formatDate(opportunity.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}

function DetailCard({ label, mono, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={mono ? "mt-3 font-mono text-sm text-foreground" : "mt-3 text-2xl font-semibold tracking-tight text-foreground"}>{value}</p>
    </section>
  );
}
