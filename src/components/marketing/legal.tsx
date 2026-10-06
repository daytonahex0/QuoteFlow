export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 md:py-20">
      <h1 className="text-4xl font-bold tracking-tight text-ink-900">{title}</h1>
      <p className="mt-2 text-sm text-ink-500">Last updated {updated}</p>
      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-ink-700 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}
