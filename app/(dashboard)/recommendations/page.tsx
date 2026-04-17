import Link from "next/link";

import { RecommendationBulkGenerateForm } from "@/components/forms/recommendation-bulk-generate-form";
import { RecommendationTaskForm } from "@/components/forms/recommendation-task-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type LinkedTask = {
  id: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

type RecommendationRecord = {
  id: string;
  workspaceId: string;
  pageId: string | null;
  title: string;
  type: string;
  status: string;
  resolutionState: string;
  priority: string;
  createdAt: string;
  linkedTasks: LinkedTask[];
};

type Workspace = {
  id: string;
  name: string;
};

type Site = {
  id: string;
  workspaceId: string;
  domain: string;
};

type CoveragePageItem = {
  id: string;
  title: string | null;
  path: string;
  pageType: string | null;
  existsLive: boolean;
  updatedAt: string;
  latestOverallScore: number | null;
  latestSuccessfulScanAt: string | null;
  blockersCount: number;
  activeRecommendationCount: number;
  latestRecommendationBatchStatus: string | null;
};

type RecommendationCoverage = {
  totalScannablePages: number;
  scannedPagesCount: number;
  pagesWithActiveRecommendationsCount: number;
  pagesNeedingRecommendationsCount: number;
  pagesWithoutSuccessfulScanCount: number;
  pagesWithResolvedOnlyCount: number;
  pagesNeedingRecommendations: CoveragePageItem[];
  pagesWithoutSuccessfulScan: CoveragePageItem[];
  pagesWithActiveRecommendations: CoveragePageItem[];
  pagesWithResolvedOnly: CoveragePageItem[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function formatScore(value: number | null) {
  return value !== null ? value.toFixed(2) : "-";
}

export default async function RecommendationsRoute() {
  const [recommendations, coverage, workspaces, sites] = await Promise.all([
    apiFetch<RecommendationRecord[]>("/api/recommendations"),
    apiFetch<RecommendationCoverage>("/api/recommendations/coverage"),
    apiFetch<Workspace[]>("/api/workspaces"),
    apiFetch<Site[]>("/api/sites"),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Recommendations</h1>
        <p className="text-sm text-muted-foreground">Recommendation queue generated from persisted scan and score state.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CoverageCard label="Scanned pages" value={coverage.scannedPagesCount} />
        <CoverageCard
          label="Active recommendation coverage"
          value={coverage.pagesWithActiveRecommendationsCount}
        />
        <CoverageCard
          label="Need recommendations"
          value={coverage.pagesNeedingRecommendationsCount}
          warn
        />
        <CoverageCard
          label="Without successful scan"
          value={coverage.pagesWithoutSuccessfulScanCount}
          warn
        />
      </section>

      <RecommendationBulkGenerateForm sites={sites} workspaces={workspaces} />

      <section className="grid gap-6 xl:grid-cols-2">
        <CoverageList
          title="Pages needing recommendations"
          empty="All scanned pages already have an active recommendation batch."
          items={coverage.pagesNeedingRecommendations}
        />
        <CoverageList
          title="Pages without successful scan"
          empty="Every scannable page has a successful scan."
          items={coverage.pagesWithoutSuccessfulScan}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Recommendation Queue</h2>
        </div>

        {recommendations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">No recommendations yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Generate recommendations from a successful page scan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Title</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Resolution</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Priority</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Task</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card align-top">
                {recommendations.map((recommendation) => {
                  const linkedTask = recommendation.linkedTasks[0] ?? null;
                  const awaitingRescan =
                    linkedTask?.status === "DONE" && recommendation.status !== "RESOLVED";

                  return (
                    <tr key={recommendation.id}>
                      <td className="px-6 py-4 font-medium text-foreground">{recommendation.title}</td>
                      <td className="px-6 py-4 text-muted-foreground">{recommendation.type}</td>
                      <td className="px-6 py-4 text-muted-foreground">{recommendation.status}</td>
                      <td className="px-6 py-4 text-muted-foreground">{recommendation.resolutionState}</td>
                      <td className="px-6 py-4 text-muted-foreground">{recommendation.priority}</td>
                      <td className="px-6 py-4 text-muted-foreground">{formatDate(recommendation.createdAt)}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {linkedTask ? (
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{linkedTask.status}</p>
                            {linkedTask.dueDate && (
                              <p className="text-xs">Due {formatDate(linkedTask.dueDate)}</p>
                            )}
                            {awaitingRescan && (
                              <p className="text-xs font-medium text-amber-600">
                                Done — awaiting rescan
                              </p>
                            )}
                            <Link
                              className="text-xs text-foreground underline-offset-4 hover:underline"
                              href="/planner"
                            >
                              Open planner
                            </Link>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No task</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {linkedTask ? null : (
                          <RecommendationTaskForm
                            defaultTitle={recommendation.title}
                            linkedPageId={recommendation.pageId}
                            linkedRecommendationId={recommendation.id}
                            workspaceId={recommendation.workspaceId}
                          />
                        )}
                      </td>
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

function CoverageCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-soft ${
        warn && value > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-card"
      }`}
    >
      <p className={`text-sm ${warn && value > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold tracking-tight ${
          warn && value > 0 ? "text-amber-800" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CoverageList({
  title,
  items,
  empty,
}: {
  title: string;
  items: CoveragePageItem[];
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {items.length === 0 ? (
        <div className="px-6 py-10 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div key={item.id} className="px-6 py-4">
              <Link className="font-medium text-foreground hover:underline" href={`/pages/${item.id}`}>
                {item.title?.trim() || item.path}
              </Link>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="font-mono">{item.path}</span>
                {item.pageType ? <span>{item.pageType}</span> : null}
                <span>Score {formatScore(item.latestOverallScore)}</span>
                {item.latestSuccessfulScanAt ? (
                  <span>Scanned {formatDate(item.latestSuccessfulScanAt)}</span>
                ) : (
                  <span>Not scanned</span>
                )}
                <span>Blockers {item.blockersCount}</span>
                {item.latestRecommendationBatchStatus ? (
                  <span>Latest batch {item.latestRecommendationBatchStatus}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
