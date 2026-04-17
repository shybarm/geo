import Link from "next/link";

import { ClusterCreateForm } from "@/components/forms/cluster-create-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type Workspace = {
  id: string;
  name: string;
};

type ClusterRecord = {
  id: string;
  workspaceId: string;
  name: string;
  topic: string | null;
  ownerUserId: string | null;
  createdAt: string;
  _count: {
    memberships: number;
  };
};

type ClusterHealthSummary = {
  clusterId: string;
  healthStatus: string;
  averageOverallScore: number | null;
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

function formatScore(value: number | null) {
  return value == null ? "-" : value.toFixed(2);
}

function healthBadgeClass(status: string) {
  if (status === "Healthy") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "Weak") return "border-red-300 bg-red-50 text-red-700";
  return "border-amber-300 bg-amber-50 text-amber-700";
}

export default async function ClustersRoute() {
  const [clusters, workspaces] = await Promise.all([
    apiFetch<ClusterRecord[]>("/api/clusters"),
    apiFetch<Workspace[]>("/api/workspaces"),
  ]);

  const healthByCluster = new Map<string, ClusterHealthSummary>();

  await Promise.all(
    clusters.map(async (cluster) => {
      const health = await apiFetch<ClusterHealthSummary>(`/api/clusters/${cluster.id}/health`);
      healthByCluster.set(cluster.id, health);
    }),
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Clusters</h1>
        <p className="text-sm text-muted-foreground">Group pages by topic and track weak coverage.</p>
      </div>

      <ClusterCreateForm workspaces={workspaces} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Cluster Queue</h2>
        </div>

        {clusters.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">No clusters yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create your first cluster.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Topic</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Health</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Average Score</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Owner User ID</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Membership Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {clusters.map((cluster) => {
                  const health = healthByCluster.get(cluster.id);
                  return (
                    <tr key={cluster.id}>
                      <td className="px-6 py-4 font-medium text-foreground">
                        <Link className="transition hover:text-muted-foreground" href={`/clusters/${cluster.id}`}>
                          {cluster.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{cluster.topic || "-"}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {health ? (
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${healthBadgeClass(health.healthStatus)}`}>
                            {health.healthStatus}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatScore(health?.averageOverallScore ?? null)}</td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{cluster.ownerUserId ?? "-"}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(cluster.createdAt)}</td>
                      <td className="px-6 py-4 text-muted-foreground">{cluster._count.memberships}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
