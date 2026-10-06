export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded-lg bg-ink-200/70" />
      <div className="h-4 w-72 rounded bg-ink-200/60" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-28 rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)]" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
