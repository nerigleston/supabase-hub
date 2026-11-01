"use client";

import { useEffect, useState, useTransition } from "react";
import { type QueryResult, runSqlAction } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "./confirm-action";
import { SqlCodeEditor } from "./sql-code-editor";
import { downloadCsv, ResultGrid } from "./result-grid";
import { buttonClass, Card, Kbd, Notice } from "./app-ui";

const SNIPPETS = [
  { label: "Tabelas e tamanho", sql: "select schemaname, relname as tabela, n_live_tup as linhas, pg_size_pretty(pg_total_relation_size(relid)) as tamanho\nfrom pg_stat_user_tables\norder by pg_total_relation_size(relid) desc;" },
  { label: "Tamanho do banco", sql: "select pg_size_pretty(pg_database_size(current_database())) as tamanho;" },
  { label: "Conexões ativas", sql: "select usename, application_name, state, count(*)\nfrom pg_stat_activity\ngroup by 1, 2, 3\norder by 4 desc;" },
  { label: "Tabelas sem RLS", sql: "select n.nspname as schema, c.relname as tabela\nfrom pg_class c join pg_namespace n on n.oid = c.relnamespace\nwhere c.relkind = 'r' and n.nspname = 'public' and not c.relrowsecurity;" },
  { label: "Extensões", sql: "select extname, extversion from pg_extension order by 1;" },
];

/** Detecta comandos destrutivos para pedir confirmação (heurística 5). */
function riskOf(sql: string): string | null {
  const s = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
  if (/\bdrop\s+(table|schema|database|view|function|index|type)\b/.test(s)) return "Este SQL apaga objetos do banco (DROP).";
  if (/\btruncate\b/.test(s)) return "Este SQL apaga todas as linhas de uma tabela (TRUNCATE).";
  if (/\bdelete\s+from\b/.test(s) && !/\bwhere\b/.test(s)) return "DELETE sem WHERE apaga todas as linhas da tabela.";
  if (/\bupdate\s+\S+\s+set\b/.test(s) && !/\bwhere\b/.test(s)) return "UPDATE sem WHERE altera todas as linhas da tabela.";
  if (/\b(delete|update|alter|grant|revoke)\b/.test(s)) return "Este SQL altera dados ou permissões.";
  return null;
}

type HistoryItem = { sql: string; at: number; ok: boolean };

export function SqlEditor({
  org,
  projectRef,
  projectName,
  initial,
  canWrite = true,
}: {
  org: string;
  projectRef: string;
  projectName: string;
  initial?: string;
  /** papel Leitura: modo somente leitura travado */
  canWrite?: boolean;
}) {
  const [sql, setSql] = useState(initial ?? "select now();");
  const [readOnly, setReadOnly] = useState(true);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const storageKey = `sql-history:${projectRef}`;

  useEffect(() => {
    try {
      // localStorage só existe no cliente: carregar depois da hidratação é intencional
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
    } catch {}
  }, [storageKey]);

  const remember = (item: HistoryItem) => {
    const next = [item, ...history.filter((h) => h.sql !== item.sql)].slice(0, 20);
    setHistory(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const execute = () =>
    start(async () => {
      setError(null);
      setInfo(null);
      const r = await runSqlAction(org, projectRef, sql, readOnly || !canWrite);
      remember({ sql, at: Date.now(), ok: r.ok });
      if (!r.ok) {
        setResult(null);
        const blockedByReadOnly = readOnly && /read-only transaction/i.test(r.message);
        setError(blockedByReadOnly ? "O modo somente leitura bloqueou este comando. Desligue o modo para alterar dados." : r.message);
        return;
      }
      setResult(r.data ?? null);
      setInfo(r.message);
    });

  const run = () => {
    if (!sql.trim() || pending) return;
    if (!readOnly && riskOf(sql)) setConfirmOpen(true);
    else execute();
  };

  const risk = riskOf(sql);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={readOnly || !canWrite} disabled={!canWrite} onChange={(e) => setReadOnly(e.target.checked)} />
              <span>
                Somente leitura{" "}
                <span className="text-xs text-zinc-500">{!canWrite ? "(seu papel neste banco é Leitura)" : readOnly ? "(nada é alterado no banco)" : "(desligado: comandos alteram o banco)"}</span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-zinc-500 sm:inline"><Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd></span>
              <button onClick={run} disabled={pending || !sql.trim()} className={buttonClass(readOnly ? "primary" : "danger")}>
                {pending && <Spinner />}
                {pending ? "Executando…" : readOnly ? "Executar" : "Executar (escrita)"}
              </button>
            </div>
          </div>
          <SqlCodeEditor value={sql} onChange={setSql} onRun={run} />
          {!readOnly && risk && (
            <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              ⚠ {risk} Vai pedir confirmação.
            </p>
          )}
        </Card>

        {error && <Notice tone="error" title="O banco recusou o comando">{error}</Notice>}
        {result && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
              <span role="status">{info}{result.rows.length >= 1000 && " Mostrando as primeiras 1000."}</span>
              {result.rows.length > 0 && (
                <button onClick={() => downloadCsv(`resultado-${projectRef}.csv`, result.columns, result.rows)} className={buttonClass("ghost", "px-2 py-1 text-xs")}>Baixar CSV</button>
              )}
            </div>
            <ResultGrid columns={result.columns} rows={result.rows} />
          </Card>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <Card className="p-3">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Modelos</h2>
          <ul className="flex flex-col">
            {SNIPPETS.map((s) => (
              <li key={s.label}>
                <button onClick={() => setSql(s.sql)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-3">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Histórico deste projeto</h2>
          {history.length ? (
            <ul className="flex max-h-80 flex-col overflow-y-auto">
              {history.map((h) => (
                <li key={h.at}>
                  <button onClick={() => setSql(h.sql)} title={h.sql} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <span aria-label={h.ok ? "sucesso" : "erro"} className={h.ok ? "text-emerald-600" : "text-rose-600"}>{h.ok ? "✓" : "✕"}</span>
                    <span className="truncate font-mono text-xs">{h.sql.replace(/\s+/g, " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">As consultas executadas aparecem aqui (só neste navegador).</p>
          )}
        </Card>
      </aside>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Executar SQL de escrita em &quot;{projectName}&quot;?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-3">
                <p className="text-amber-700 dark:text-amber-300">⚠ {risk}</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-zinc-950 p-3 text-left font-mono text-xs text-zinc-100">{sql}</pre>
                <p>Não há como desfazer pelo painel. Se tiver dúvida, faça um backup antes.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <button onClick={() => (setConfirmOpen(false), execute())} className={buttonClass("danger")}>
              Executar mesmo assim
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
