import { TaskUpdateForm } from "@/components/forms/task-update-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type LinkedRecommendation = {
  id: string;
  title: string;
  status: string;
};

type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  linkedPageId: string | null;
  linkedRecommendationId: string | null;
  linkedRecommendation: LinkedRecommendation | null;
  dueDate: string | null;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function PlannerRoute() {
  const tasks = await apiFetch<TaskRecord[]>("/api/tasks");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Planner</h1>
        <p className="text-sm text-muted-foreground">Real persisted task queue for recommendation follow-through.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Open Work</h2>
        </div>

        {tasks.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">No tasks yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create a task from a recommendation to populate the planner.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tasks.map((task) => {
              const rec = task.linkedRecommendation;
              const awaitingRescan =
                task.status === "DONE" && rec !== null && rec.status !== "RESOLVED";

              return (
                <div key={task.id} className="px-6 py-6">
                  <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-base font-medium text-foreground">{task.title}</h3>
                        <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                          {task.status}
                        </span>
                        <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
                          {task.priority}
                        </span>
                        {awaitingRescan && (
                          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                            Done — awaiting rescan
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{task.description || "No description added."}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {rec ? (
                          <span>
                            Recommendation: {rec.title} &middot; {rec.status}
                          </span>
                        ) : (
                          <span>No linked recommendation</span>
                        )}
                        <span>Due {formatDate(task.dueDate)}</span>
                        <span>Created {formatDate(task.createdAt)}</span>
                      </div>
                    </div>
                    <TaskUpdateForm task={task} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
