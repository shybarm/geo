import { WorkspaceCreateForm } from "@/components/forms/workspace-create-form";
import { apiFetch } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type Workspace = {
  id: string;
  name: string;
  createdAt: string;
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

export default async function WorkspacesPage() {
  const workspaces = await apiFetch<Workspace[]>("/api/workspaces");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-sm text-muted-foreground">Manage GEO OS workspace containers.</p>
      </div>

      <WorkspaceCreateForm />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Workspace Registry</h2>
        </div>

        {workspaces.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-base font-medium text-foreground">No workspaces yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Create your first workspace to begin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {workspaces.map((workspace) => (
                  <tr key={workspace.id}>
                    <td className="px-6 py-4 font-medium text-foreground">{workspace.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatDate(workspace.createdAt)}</td>
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
