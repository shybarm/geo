import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/forms/onboarding-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let workspaceCount = 0;
  try {
    workspaceCount = await prisma.workspace.count();
  } catch {
    // DB unavailable — show the setup form rather than crashing
  }

  if (workspaceCount > 0) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.14),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-10 shadow-soft">
        <div className="mb-8 space-y-2">
          <span className="inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            GEO OS
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="text-sm text-muted-foreground">
            Enter your domain — pages are discovered and imported automatically.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
