import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import { STATUS, type StatusTone } from "@/lib/status";
import type { ProjectStatus } from "@/lib/supabase-api";

// Componentes visuais compartilhados: mesmo padrão em todas as telas (heurística 4).

// Botões e campos vêm do shadcn/ui (components/ui); estes atalhos mantêm a API
// usada nas telas e garantem o mesmo visual em todo o app (heurística 4).
const VARIANT = { primary: "default", secondary: "outline", danger: "destructive", ghost: "ghost" } as const;

export function buttonClass(variant: keyof typeof VARIANT = "secondary", extra = "") {
  const size = /\btext-xs\b/.test(extra) ? "sm" : "default";
  return cn(buttonVariants({ variant: VARIANT[variant], size }), extra);
}

export const inputClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

const TONE: Record<StatusTone, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900",
  paused: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900",
  busy: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-900",
  error: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-900",
};
const DOT: Record<StatusTone, string> = {
  ok: "bg-emerald-500",
  paused: "bg-amber-500",
  busy: "bg-sky-500 animate-pulse",
  error: "bg-rose-500",
};

/** Cor + texto + dica: o estado nunca depende só da cor. */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status] ?? STATUS.UNKNOWN;
  return (
    <span title={s.hint} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONE[s.tone]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[s.tone]}`} />
      {s.label}
    </span>
  );
}

export function Tone({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[tone]}`}>{children}</span>;
}

export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Notice({ tone, title, children, action }: { tone: "info" | "warn" | "error" | "ok"; title: string; children?: ReactNode; action?: ReactNode }) {
  const map = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-100",
    error: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-100",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 text-sm ${map[tone]}`}>
      <div>
        <p className="font-medium">{title}</p>
        {children && <div className="mt-1 opacity-90">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: StatusTone }) {
  const color = tone ? { ok: "text-emerald-600", paused: "text-amber-600", busy: "text-sky-600", error: "text-rose-600" }[tone] : "";
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </Card>
  );
}

export function TextLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} className={`font-medium text-emerald-700 hover:underline dark:text-emerald-400 ${props.className ?? ""}`} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-zinc-300 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{children}</kbd>;
}

/**
 * Bancos grátis ligados no e-mail Supabase (limite do plano Free: 2 por login).
 * Texto + barrinha: o estado não depende só da cor (heurísticas 1 e 2).
 */
export function FreeMeter({ used, limit = 2, compact = false }: { used: number; limit?: number; compact?: boolean }) {
  const free = Math.max(0, limit - used);
  return (
    <span
      className="inline-flex items-center gap-2"
      title={`No plano grátis, cada pessoa (e-mail) dona ou admin pode ter ${limit} bancos ligados ao mesmo tempo, somando todas as organizações em que tem esse papel. Bancos pausados não contam.`}
    >
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: limit }, (_, i) => (
          <span key={i} className={`h-2 w-4 rounded-sm ${i < used ? (free ? "bg-sky-500" : "bg-rose-500") : "bg-zinc-300 dark:bg-zinc-700"}`} />
        ))}
      </span>
      <span>
        {!compact && "Bancos grátis ligados: "}
        <strong className="tabular-nums">{used} de {limit}</strong>
        {" · "}
        {free ? (
          <span className="text-emerald-600 dark:text-emerald-400">{free} livre{free > 1 ? "s" : ""}</span>
        ) : (
          <span className="text-rose-600 dark:text-rose-400">{used > limit ? "acima do limite" : "limite atingido"}</span>
        )}
      </span>
    </span>
  );
}
