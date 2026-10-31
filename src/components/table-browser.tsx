"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { tableRowsAction } from "@/app/actions";
import { Spinner } from "./confirm-action";
import { downloadCsv, ResultGrid } from "./result-grid";
import { buttonClass, Card, EmptyState, inputClass, Notice } from "./app-ui";

export type TableInfo = { schema: string; name: string; estimated_rows: number; size: string; rls: boolean };

const SYSTEM_SCHEMAS = new Set(["auth", "storage", "realtime", "extensions", "graphql", "graphql_public", "net", "pgbouncer", "pgsodium", "supabase_functions", "supabase_migrations", "vault", "cron"]);

export function TableBrowser({ org, projectRef, tables }: { org: string; projectRef: string; tables: TableInfo[] }) {
  const [filter, setFilter] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [selected, setSelected] = useState<TableInfo | null>(null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ columns: string[]; rows: Record<string, unknown>[]; types: Record<string, string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(
    () =>
      tables.filter(
        (t) => (showSystem || !SYSTEM_SCHEMAS.has(t.schema)) && `${t.schema}.${t.name}`.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [tables, filter, showSystem],
  );

  const open = (t: TableInfo, p = 0) =>
    start(async () => {
      setSelected(t);
      setPage(p);
      setError(null);
      const r = await tableRowsAction(org, projectRef, t.schema, t.name, p);
      if (!r.ok || !r.data) {
        setData(null);
        setError(r.message);
        return;
      }
      setData({ columns: r.data.columns, rows: r.data.rows, types: r.data.columnTypes });
    });

  if (!tables.length) {
    return (
      <EmptyState title="Nenhuma tabela encontrada" action={<Link href={`/p/${org}/${projectRef}/sql`} className={buttonClass("primary")}>Abrir editor SQL</Link>}>
        Este banco ainda não tem tabelas fora dos schemas do sistema.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="flex max-h-[75vh] flex-col overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar tabelas" aria-label="Filtrar tabelas" className={inputClass} />
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
            Mostrar schemas do Supabase (auth, storage…)
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5">
          {visible.map((t) => {
            const active = selected?.schema === t.schema && selected.name === t.name;
            return (
              <li key={`${t.schema}.${t.name}`}>
                <button
                  onClick={() => open(t)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                    active ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {t.schema !== "public" && <span className="text-zinc-400">{t.schema}.</span>}
                    {t.name}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400 tabular-nums" title="Linhas (estimativa)">
                    {t.estimated_rows < 0 ? "?" : `~${Intl.NumberFormat("pt-BR", { notation: "compact" }).format(t.estimated_rows)}`}
                  </span>
                </button>
              </li>
            );
          })}
          {!visible.length && <li className="p-3 text-sm text-zinc-500">Nenhuma tabela com esse nome.</li>}
        </ul>
        <p className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">{visible.length} de {tables.length} tabelas</p>
      </Card>

      <Card className="min-w-0 overflow-hidden">
        {!selected ? (
          <div className="grid h-full min-h-60 place-items-center p-6 text-sm text-zinc-500">Escolha uma tabela à esquerda para ver os dados.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div>
                <h2 className="font-semibold">
                  <span className="text-zinc-400">{selected.schema}.</span>
                  {selected.name}
                </h2>
                <p className="text-xs text-zinc-500">
                  {selected.size} · RLS {selected.rls ? "ativo" : <strong className="text-amber-600">desativado</strong>} · somente leitura
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pending && <Spinner />}
                <button disabled={pending || page === 0} onClick={() => open(selected, page - 1)} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>← Anterior</button>
                <span className="text-xs text-zinc-500 tabular-nums">Página {page + 1}</span>
                <button disabled={pending || (data?.rows.length ?? 0) < 50} onClick={() => open(selected, page + 1)} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>Próxima →</button>
                {data && data.rows.length > 0 && (
                  <button onClick={() => downloadCsv(`${selected.name}-p${page + 1}.csv`, data.columns, data.rows)} className={buttonClass("ghost", "px-2.5 py-1 text-xs")}>CSV</button>
                )}
                <Link
                  href={`/p/${org}/${projectRef}/sql?q=${encodeURIComponent(`select * from "${selected.schema}"."${selected.name}" limit 100;`)}`}
                  className={buttonClass("ghost", "px-2.5 py-1 text-xs")}
                >
                  Abrir no SQL
                </Link>
              </div>
            </div>
            {error ? (
              <div className="p-4"><Notice tone="error" title="Não foi possível ler a tabela">{error}</Notice></div>
            ) : data ? (
              <ResultGrid columns={data.columns} rows={data.rows} types={data.types} stickyFirst />
            ) : (
              <div className="grid min-h-40 place-items-center"><Spinner /></div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
