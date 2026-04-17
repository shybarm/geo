export function Topbar() {
  return (
    <header className="sticky top-0 z-10 border-b border-border/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 lg:px-10">
        <div className="space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            GEO OS
          </p>
          <h1 className="text-sm font-medium text-foreground">Operations Console</h1>
        </div>
        <div className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
          Draft Environment
        </div>
      </div>
    </header>
  );
}
