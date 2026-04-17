import { EntityCreateForm } from "@/components/forms/entity-create-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Workspace = {
  id: string;
  name: string;
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

export default async function AuthorityRoute() {
  const [workspaces, totalEntities, totalPageEntitySignals, pagesWithAuthoritySignals, pagesMissingAuthoritySignals, entities] = await Promise.all([
    prisma.workspace.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.entity.count(),
    prisma.pageEntitySignal.count(),
    prisma.page.findMany({
      where: {
        entitySignals: {
          some: {
            signalType: {
              in: ["AUTHOR", "REVIEWER"],
            },
          },
        },
      },
      select: { id: true },
      distinct: ["id"],
    }).then((rows) => rows.length),
    prisma.page.count({
      where: {
        currentLivePageVersionId: { not: null },
        entitySignals: {
          none: {
            signalType: {
              in: ["AUTHOR", "REVIEWER", "CREDENTIAL", "INSTITUTION"],
            },
          },
        },
      },
    }),
    prisma.entity.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Authority</h1>
        <p className="text-sm text-muted-foreground">Real authority coverage from entity records and page-level signals.</p>
      </div>

      <EntityCreateForm workspaces={workspaces as Workspace[]} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Entities" value={String(totalEntities)} />
        <SummaryCard label="Page Entity Signals" value={String(totalPageEntitySignals)} />
        <SummaryCard label="Pages With Author or Reviewer" value={String(pagesWithAuthoritySignals)} />
        <SummaryCard label="Pages Missing Authority Signals" value={String(pagesMissingAuthoritySignals)} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Latest Entity Records</h2>
        </div>

        {entities.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">No entities yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create your first entity.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Entity Type</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Canonical Name</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {entities.map((entity) => (
                  <tr key={entity.id}>
                    <td className="px-6 py-4 font-medium text-foreground">{entity.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{entity.entityType}</td>
                    <td className="px-6 py-4 text-muted-foreground">{entity.canonicalName || "-"}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(entity.createdAt.toISOString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
    </section>
  );
}
