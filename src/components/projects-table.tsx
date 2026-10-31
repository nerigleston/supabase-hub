"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { restoreProjectAction } from "@/app/actions";
import type { ProjectRow } from "@/lib/hub";
import { regionLabel, STATUS, type StatusTone } from "@/lib/status";
import { ConfirmAction } from "./confirm-action";
import { KeepAliveInfo } from "./keepalive-info";
import { KeepAliveToggle } from "./keepalive-toggle";
import { ProjectActionsMenu } from "./project-actions-menu";
import { EmptyState, inputClass, Kbd, StatusBadge } from "./app-ui";

const FILTERS: { key: "all" | StatusTone; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "ok", label: "No ar" },
  { key: "paused", label: "Pausados" },
  { key: "busy", label: "Em transição" },
  { key: "error", label: "Com problema" },
];

function RowKeepAlive({ p }: { p: ProjectRow }) {
  return (
    <KeepAliveToggle
      key={`${p.ref}-${p.keepAlive?.lastPingAt ?? ""}-${p.keepAlive?.enabled ?? ""}`}
      org={p.accountSlug}
      projectRef={p.ref}
      name={p.name}
      value={p.keepAlive}
      disabled={!p.keepAlive?.enabled && p.status !== "ACTIVE_HEALTHY" && p.status !== "ACTIVE_UNHEALTHY"}
    />
  );
}

function RowActions({ p }: { p: ProjectRow }) {
  const canRestore = p.status === "INACTIVE" || p.status === "RESTORE_FAILED";
  return (
    <div className="flex items-center justify-end gap-2">
      {canRestore && (
        <ConfirmAction
          label="Reativar"
          variant="primary"
          pendingLabel="Reativando…"
          confirm={{
            title: `Reativar "${p.name}"?`,
            body: (
              <>
                O projeto volta ao ar em 2 a 5 minutos, com os dados intactos. No plano grátis ele passa a contar como 1 dos 2 bancos ligados
                do e-mail <strong>{p.login ?? p.account}</strong>.
              </>
            ),
            confirmLabel: "Reativar agora",
          }}
          action={() => restoreProjectAction(p.accountSlug, p.ref, p.name)}
        />
      )}
      <ProjectActionsMenu project={p} />
    </div>
  );
}

export function ProjectsTable({ projects, accounts }: { projects: ProjectRow[]; accounts: { slug: string; name: string }[] }) {
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState<"all" | StatusTone>("all");
  const [account, setAccount] = useState("all");
  const search = useRef<HTMLInputElement>(null);

  // Atalho "/" para buscar (heurística 7)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    for (const p of projects) {
      const t = STATUS[p.status]?.tone ?? "error";
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [projects]);

  const filtered = projects.filter((p) => {
    const q = query.trim().toLowerCase();
    if (q && !`${p.name} ${p.ref} ${p.account} ${p.login ?? ""}`.toLowerCase().includes(q)) return false;
    if (tone !== "all" && (STATUS[p.status]?.tone ?? "error") !== tone) return false;
    if (account !== "all" && p.accountSlug !== account) return false;
    return true;
  });

  const clear = () => {
    setQuery("");
    setTone("all");
    setAccount("all");
  };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-56">
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por projeto, ref, organização ou e-mail"
            aria-label="Buscar projetos"
            className={`${inputClass} pr-10`}
          />
          <span className="absolute top-1/2 right-2 hidden -translate-y-1/2 sm:block"><Kbd>/</Kbd></span>
        </div>
        <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Filtrar por conta" className={`${inputClass} sm:w-auto`}>
          <option value="all">Todas as contas</option>
          {accounts.map((a) => (
            <option key={a.slug} value={a.slug}>{a.name}</option>
          ))}
        </select>
      </div>
      <div role="group" aria-label="Filtrar por estado" className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={tone === f.key}
            onClick={() => setTone(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
              tone === f.key
                ? "bg-zinc-900 text-white ring-zinc-900 dark:bg-white dark:text-zinc-900 dark:ring-white"
                : "text-zinc-600 ring-zinc-300 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nenhum projeto encontrado"
          action={<button onClick={clear} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">Limpar filtros</button>}
        >
          Nenhum projeto corresponde aos filtros atuais.
        </EmptyState>
      ) : (
        <>
          {/* Celular: cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((p) => (
              <li key={p.ref} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/p/${p.accountSlug}/${p.ref}`} className="font-medium hover:underline">{p.name}</Link>
                    <p className="truncate font-mono text-xs text-zinc-500">{p.ref}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {p.account}
                  {p.login && <span className="text-zinc-400"> · {p.login}</span>}
                  <span className="text-zinc-400"> · {regionLabel(p.region)}</span>
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <RowKeepAlive p={p} />
                  <RowActions p={p} />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase dark:border-zinc-800 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Projeto</th>
                  <th className="px-4 py-2.5 font-medium">Conta</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      Manter ativo <KeepAliveInfo />
                    </span>
                  </th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Região</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filtered.map((p) => (
                  <tr key={p.ref} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3">
                      <Link href={`/p/${p.accountSlug}/${p.ref}`} className="font-medium hover:underline">{p.name}</Link>
                      <p className="font-mono text-xs text-zinc-500">{p.ref}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                      {p.account}
                      {p.login && <p className="truncate text-xs text-zinc-500">{p.login}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3"><RowKeepAlive p={p} /></td>
                    <td className="hidden px-4 py-3 text-zinc-600 lg:table-cell dark:text-zinc-300">{regionLabel(p.region)}</td>
                    <td className="px-4 py-3"><RowActions p={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
