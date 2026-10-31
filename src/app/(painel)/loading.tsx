// Feedback imediato ao navegar (heurística 1): esqueleto enquanto o Supabase responde.
export default function Loading() {
  return (
    <div role="status" aria-label="Carregando" className="animate-pulse">
      <div className="mb-2 h-6 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-8 h-4 w-96 max-w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <span className="sr-only">Carregando dados do Supabase…</span>
    </div>
  );
}
