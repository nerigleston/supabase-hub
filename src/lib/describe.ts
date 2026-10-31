import "server-only";
import { createHash } from "node:crypto";
import { anthropic } from "./ai";
import type { Connection, DbDescription } from "./db";
import { env } from "./env";
import { redactSecrets } from "./redact";
import { clientFor, type Project } from "./supabase-api";

// Descrição de um banco gerada por IA a partir do ESQUEMA (e, se o usuário pedir,
// de 2 linhas de exemplo por tabela, com colunas sensíveis ocultas).
//
// Feito para aguentar bancos com milhares de tabelas sem gastar muito token:
// - a impressão digital cobre TODAS as tabelas, mas é um hash por tabela calculado
//   no próprio Postgres (zero token): serve para avisar quando o esquema muda;
// - para a IA vão só as ~40 tabelas mais relevantes com colunas, até 300 nomes
//   soltos e, do resto, uma contagem por prefixo. O pedido tem teto fixo.
// - partições (eventos_2024_01...) não contam: só a tabela-mãe.

// Schemas internos do Supabase/Postgres: ficam fora (não dizem nada do projeto).
const SYSTEM_SCHEMAS = [
  "pg_catalog", "information_schema", "pg_toast", "auth", "storage", "realtime", "_realtime", "supabase_functions",
  "supabase_migrations", "extensions", "graphql", "graphql_public", "net", "pgsodium", "pgsodium_masks", "vault",
  "cron", "pgbouncer", "_analytics", "pgmq", "pgmq_public", "tiger", "topology", "drizzle",
];
const NOT_SYSTEM = `n.nspname not in (${SYSTEM_SCHEMAS.map((s) => `'${s}'`).join(",")}) and n.nspname not like 'pg\\_%'`;
const COLTYPE = "a.attname || ':' || format_type(a.atttypid, a.atttypmod)";

// 1 linha por tabela: linhas estimadas, nº de colunas e hash das colunas (compacto)
const TABLES_SQL = `select n.nspname as s, c.relname as t, greatest(c.reltuples, 0)::bigint as n,
  count(a.attnum)::int as nc, left(md5(string_agg(${COLTYPE}, ',' order by a.attnum)), 10) as h
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relkind in ('r', 'p') and not c.relispartition and ${NOT_SYSTEM}
group by 1, 2, 3 order by 1, 2 limit 5000`;

const FK_SQL = `select conrelid::regclass::text as f, confrelid::regclass::text as t
from pg_constraint co join pg_class c on c.oid = co.conrelid join pg_namespace n on n.oid = c.relnamespace
where co.contype = 'f' and ${NOT_SYSTEM} limit 2000`;

const DETAILED = { normal: 40, ampla: 120 }; // tabelas com colunas no pedido ("Usar mais tabelas" = ampla)
const MAX_CHARS = { normal: 32_000, ampla: 80_000 }; // teto do pedido (~8 mil / ~20 mil tokens)
const NAMES_ONLY = 300; // só o nome
const MAX_COLS = 25; // colunas por tabela

const keyOf = (s: string, t: string) => (s === "public" ? t : `${s}.${t}`);
const splitKey = (k: string) => (k.includes(".") ? (k.split(".", 2) as [string, string]) : (["public", k] as [string, string]));
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const ident = (n: string) => `"${n.replace(/"/g, '""')}"`;

export type Snapshot = {
  /** "tabela" ou "schema.tabela" -> hash das colunas (para o diff) */
  tables: Record<string, string>;
  rows: Record<string, number>;
  /** quantas FKs apontam para a tabela (importância) */
  refs: Record<string, number>;
  fks: string[];
  fingerprint: string;
  total: number;
};

export async function schemaSnapshot(conn: Connection, ref: string): Promise<Snapshot> {
  const api = clientFor(conn);
  const [rows, fks] = await Promise.all([
    api.query<{ s: string; t: string; n: number; nc: number; h: string }>(ref, TABLES_SQL, { readOnly: true }),
    api.query<{ f: string; t: string }>(ref, FK_SQL, { readOnly: true }).catch(() => []),
  ]);
  const tables: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = keyOf(r.s, r.t);
    tables[k] = r.h;
    counts[k] = Math.max(0, Number(r.n) || 0);
  }
  // regclass vem "schema.tabela" (ou só "tabela" no public)
  const norm = (x: string) => x.replace(/"/g, "").replace(/^public\./, "");
  const refs: Record<string, number> = {};
  for (const f of fks) refs[norm(f.t)] = (refs[norm(f.t)] ?? 0) + 1;
  const keys = Object.keys(tables).sort();
  const fingerprint = createHash("sha256").update(keys.map((k) => `${k}:${tables[k]}`).join("\n")).digest("base64url").slice(0, 22);
  return {
    tables,
    rows: counts,
    refs,
    fks: fks.map((f) => `${norm(f.f)} -> ${norm(f.t)}`),
    fingerprint,
    total: keys.length,
  };
}

export type SchemaDiff = { addedTables: string[]; removedTables: string[]; changedTables: string[] };

export function diffSchema(before: Record<string, string> | undefined, now: Record<string, string>): SchemaDiff {
  const b = before ?? {};
  return {
    addedTables: Object.keys(now).filter((k) => !(k in b)),
    removedTables: Object.keys(b).filter((k) => !(k in now)),
    changedTables: Object.keys(now).filter((k) => k in b && b[k] !== now[k]),
  };
}

/** Ordena por importância: muito referenciada e com mais linhas primeiro. */
function ranked(snap: Snapshot): string[] {
  const score = (k: string) => (snap.refs[k] ?? 0) * 3 + Math.log10((snap.rows[k] ?? 0) + 1);
  return Object.keys(snap.tables).sort((a, b) => score(b) - score(a) || a.localeCompare(b));
}

/** "log_: 812, tmp_: 300" para as tabelas que nem o nome cabem. */
function prefixSummary(keys: string[]): string {
  const groups = new Map<string, number>();
  for (const k of keys) {
    const name = splitKey(k)[1];
    const p = name.match(/^[a-z]+_/i)?.[0] ?? name.replace(/\d+$/, "").slice(0, 12);
    groups.set(p, (groups.get(p) ?? 0) + 1);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([p, n]) => `${p}: ${n}`)
    .join(", ");
}

async function columnsOf(conn: Connection, ref: string, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const values = keys.map((k) => {
    const [s, t] = splitKey(k);
    return `(${lit(s)}, ${lit(t)})`;
  });
  const sql = `select n.nspname as s, c.relname as t, string_agg(${COLTYPE}, ', ' order by a.attnum) as cols
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where (n.nspname, c.relname) in (values ${values.join(", ")})
group by 1, 2`;
  const rows = await clientFor(conn).query<{ s: string; t: string; cols: string }>(ref, sql, { readOnly: true });
  return Object.fromEntries(
    rows.map((r) => {
      const cols = r.cols.split(", ");
      return [keyOf(r.s, r.t), cols.length > MAX_COLS ? `${cols.slice(0, MAX_COLS).join(", ")}, ... (+${cols.length - MAX_COLS} colunas)` : r.cols];
    }),
  );
}

// colunas cujo conteúdo nunca vai para a IA
const SENSITIVE_COL = /pass|senha|secret|token|hash|salt|key|cpf|cnpj|rg\b|email|e_mail|phone|telefone|celular|card|cartao|iban|ssn|birth|nascimento|address|endereco/i;

function cleanValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  s = redactSecrets(s).text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]");
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

async function sampleRows(conn: Connection, ref: string, keys: string[]): Promise<string> {
  const api = clientFor(conn);
  const parts = await Promise.all(
    keys.slice(0, 12).map(async (key) => {
      const [schema, table] = splitKey(key);
      try {
        const rs = await api.query<Record<string, unknown>>(ref, `select * from ${ident(schema)}.${ident(table)} limit 2`, { readOnly: true });
        if (!rs.length) return null;
        const lines = rs.map((r) =>
          Object.entries(r)
            .slice(0, 12)
            .map(([c, v]) => `${c}=${SENSITIVE_COL.test(c) ? "[oculto]" : cleanValue(v)}`)
            .join(", "),
        );
        return `${key}:\n  ${lines.join("\n  ")}`;
      } catch {
        return null;
      }
    }),
  );
  return parts.filter(Boolean).join("\n");
}

export type Draft = { text: string; doubts: string[]; usedTables: number; totalTables: number };

const SYSTEM = `Você descreve bancos de dados de projetos para um painel de gestão (BaseHub) e para um assistente de IA (MCP) que precisa saber qual banco é qual.
Escreva em português do Brasil, sem travessão (o caractere "—").
Responda SOMENTE com JSON válido, sem markdown: {"text": "...", "doubts": ["...", "..."]}
- "text": 2 a 4 frases, no máximo 600 caracteres, em tom AFIRMATIVO. Comece dizendo o que o sistema é ("Sistema de gestão de..."), depois as entidades principais e para que o banco serve.
  - Proibido hesitar no texto: não use "parece", "provavelmente", "possivelmente", "sugere", "indica", "aparenta", "talvez". O que for incerto vai só em "doubts".
  - Não comente volume nem estado dos dados (tabelas vazias, quantidade de linhas, "fase de teste"): isso muda com o tempo.
  - Não invente o que o esquema não mostra.
- "doubts": até 3 perguntas curtas (até 120 caracteres cada) sobre o que ficou incerto e o usuário pode confirmar ou corrigir. Lista vazia se estiver claro.`;

export async function generateDraft(
  conn: Connection,
  project: Project,
  snap: Snapshot,
  opts: { includeSamples: boolean; depth?: "normal" | "ampla"; previous?: DbDescription | null; diff?: SchemaDiff },
): Promise<Draft> {
  const depth = opts.depth ?? "normal";
  const order = ranked(snap);
  // na revisão, as tabelas novas/alteradas entram no detalhado
  const changed = opts.diff ? [...opts.diff.addedTables, ...opts.diff.changedTables] : [];
  const detailedKeys = [...new Set([...changed.filter((k) => k in snap.tables).slice(0, 15), ...order])].slice(0, DETAILED[depth]);
  const rest = order.filter((k) => !detailedKeys.includes(k));
  const namesOnly = rest.slice(0, NAMES_ONLY);
  const tail = rest.slice(NAMES_ONLY);
  const cols = await columnsOf(conn, project.ref, detailedKeys);

  const parts = [
    `Projeto: ${project.name} (ref ${project.ref}), organização ${conn.orgName}. ${snap.total} tabelas no total.`,
    `Tabelas principais com colunas:\n${detailedKeys.map((k) => `${k} (~${snap.rows[k] ?? 0} linhas): ${cols[k] ?? "?"}`).join("\n") || "(nenhuma)"}`,
  ];
  if (namesOnly.length) parts.push(`Outras tabelas (só nome):\n${namesOnly.join(", ")}`);
  if (tail.length) parts.push(`E mais ${tail.length} tabelas, agrupadas por prefixo: ${prefixSummary(tail)}`);
  const fkShown = snap.fks.filter((f) => detailedKeys.some((k) => f.startsWith(`${k} `) || f.endsWith(` ${k}`))).slice(0, 80);
  if (fkShown.length) parts.push(`Chaves estrangeiras:\n${fkShown.join("\n")}`);
  if (opts.includeSamples) {
    const samples = await sampleRows(conn, project.ref, detailedKeys);
    if (samples) parts.push(`Linhas de exemplo (colunas sensíveis ocultas):\n${samples}`);
  }
  if (opts.previous?.text) {
    parts.push(`Descrição atual (revisada pelo usuário, mantenha o que continua certo):\n${opts.previous.text}`);
    const d = opts.diff;
    if (d && (d.addedTables.length || d.removedTables.length || d.changedTables.length)) {
      const list = (xs: string[]) => (xs.length ? `${xs.slice(0, 30).join(", ")}${xs.length > 30 ? ` e mais ${xs.length - 30}` : ""}` : "nenhuma");
      parts.push(`O que mudou no esquema desde então: novas: ${list(d.addedTables)}; removidas: ${list(d.removedTables)}; com colunas alteradas: ${list(d.changedTables)}.`);
    }
  }

  const res = await anthropic().messages.create({
    model: env.aiModel,
    max_tokens: 1200,
    system: SYSTEM,
    // teto fixo do pedido, mesmo em banco com milhares de tabelas
    messages: [{ role: "user", content: parts.join("\n\n").slice(0, MAX_CHARS[depth]) }],
  });
  const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  const parsed = parseDraft(raw);
  if (HEDGE.test(parsed.text)) parsed.text = await assertive(parsed.text);
  if (!parsed.text) throw new Error("A IA não devolveu uma descrição válida. Tente de novo.");
  return { usedTables: detailedKeys.length, totalTables: snap.total, ...parsed };
}

/** Lê o JSON da IA; se vier quebrado (ex.: cortado), extrai o campo "text" mesmo assim. */
export function parseDraft(raw: string): { text: string; doubts: string[] } {
  const clean = (t: string) => t.replace(/—/g, ",").replace(/\s+/g, " ").trim();
  const body = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    const json = JSON.parse(body) as { text?: unknown; doubts?: unknown };
    return {
      text: clean(String(json.text ?? "")),
      doubts: Array.isArray(json.doubts) ? json.doubts.map((d) => clean(String(d))).filter(Boolean).slice(0, 3) : [],
    };
  } catch {
    const unescape = (t: string) => {
      try {
        return JSON.parse(`"${t}"`) as string;
      } catch {
        return t.replace(/\\"/g, '"');
      }
    };
    const text = body.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/)?.[1];
    const doubts = [...(body.match(/"doubts"\s*:\s*\[([\s\S]*)/)?.[1] ?? "").matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => clean(unescape(m[1])));
    if (text) return { text: clean(unescape(text)), doubts: doubts.filter(Boolean).slice(0, 3) };
    // não é JSON: aceita texto puro, mas nunca um pedaço de JSON
    return { text: body.startsWith("{") ? "" : clean(body).slice(0, 1200), doubts: [] };
  }
}

const HEDGE = /\b(parece|parecem|provavelmente|possivelmente|sugere|sugerem|indica que|aparenta|aparentemente|talvez)\b/i;

/** Reescreve em tom afirmativo (chamada curta, só quando o modelo hesitou). */
async function assertive(text: string): Promise<string> {
  const res = await anthropic().messages.create({
    model: env.aiModel,
    max_tokens: 400,
    system:
      'Reescreva o texto em tom afirmativo, sem "parece", "provavelmente", "possivelmente", "sugere", "indica", "aparenta" ou "talvez", sem comentar volume de dados e sem travessão. Mantenha o conteúdo e o tamanho. Responda só com o texto.',
    messages: [{ role: "user", content: text }],
  });
  const out = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").replace(/—/g, ",").trim();
  return out && !out.startsWith("{") ? out : text;
}
