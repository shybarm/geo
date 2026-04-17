import Link from "next/link";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/workspaces", label: "Workspaces" },
  { href: "/sites", label: "Sites" },
  { href: "/pages", label: "Pages" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/clusters", label: "Clusters" },
  { href: "/missing-pages", label: "Missing Pages" },
  { href: "/authority", label: "Authority" },
  { href: "/planner", label: "Planner" },
  { href: "/scans", label: "Scans" }
];

export function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-white/90 px-5 py-6 lg:block">
      <div className="flex h-full flex-col">
        <div className="mb-8 space-y-2 px-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">
            G
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">GEO OS</h2>
            <p className="text-sm text-muted-foreground">Search operations</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}
