import { cn } from "@/lib/utils";

/**
 * Marca do BaseHub: um "H" formado por dois bancos (cilindros) ligados.
 * Cores acompanham o tema; o ponto central usa a cor do fundo.
 * `onDark`: força a versão para fundo escuro (ex.: painel lateral do login).
 */
export function LogoMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const body = onDark ? "fill-emerald-500" : "fill-emerald-600 dark:fill-emerald-500";
  const top = onDark ? "fill-emerald-300" : "fill-emerald-400 dark:fill-emerald-300";
  const dot = onDark ? "fill-zinc-950" : "fill-background";
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8 shrink-0", className)}>
      <g className={body}>
        <path d="M8 14a9 4.5 0 0 1 18 0v36a9 4.5 0 0 1-18 0z" />
        <path d="M38 14a9 4.5 0 0 1 18 0v36a9 4.5 0 0 1-18 0z" />
        <rect x="24" y="27.5" width="16" height="9" rx="1" />
      </g>
      <g className={top}>
        <ellipse cx="17" cy="14" rx="9" ry="4.5" />
        <ellipse cx="47" cy="14" rx="9" ry="4.5" />
      </g>
      <circle cx="32" cy="32" r="2.6" className={dot} />
    </svg>
  );
}

/** Marca + nome. */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark onDark={onDark} />
      <span className="text-[15px] tracking-tight">
        base<span className="font-semibold">hub</span>
      </span>
    </span>
  );
}
