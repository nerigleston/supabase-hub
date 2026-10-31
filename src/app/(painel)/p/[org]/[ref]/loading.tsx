export default function Loading() {
  return (
    <div role="status" aria-label="Carregando" className="flex min-h-60 items-center justify-center gap-3 text-sm text-zinc-500">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      Consultando o banco…
    </div>
  );
}
