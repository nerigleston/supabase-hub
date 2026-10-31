"use client";

import { type ReactNode, useState } from "react";
import { buttonClass } from "./app-ui";

export type ConnEndpoints = {
  /** Supavisor (pooler): transaction na txPort (6543), session na 5432. IPv4. */
  pooler: { host: string; user: string; db: string; txPort: number; sessionPort: number } | null;
  /** Conexão direta: só IPv6 sem o add-on de IPv4. */
  direct: { host: string; user: string; db: string; port: number };
};

export const PLACEHOLDER = "[YOUR-PASSWORD]";
const MASK = "••••••••";

type Snippet = { title?: string; lang: string; code: string; note?: string };
type Tab = { key: string; label: string; intro?: string; snippets: Snippet[] };

/** Bloco de código com copiar; a senha aparece mascarada até "Mostrar". */
function CodeBlock({ s, password, show }: { s: Snippet; password: string | null; show: boolean }) {
  const [copied, setCopied] = useState(false);
  const real = s.code;
  const view = password && !show ? real.split(password).join(MASK).split(encodeURIComponent(password)).join(MASK) : real;
  const copy = async () => {
    await navigator.clipboard.writeText(real);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-col gap-1.5">
      {s.title && <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{s.title}</span>}
      <div className="relative">
        <span className="absolute top-2 left-3 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">{s.lang}</span>
        <button type="button" onClick={copy} className={buttonClass("secondary", "absolute top-2 right-2 h-7 px-2.5 text-xs")} aria-live="polite">
          {copied ? "Copiado ✓" : "Copiar"}
        </button>
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 px-3 pt-8 pb-3 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-950">
          <code className="font-mono text-zinc-800 dark:text-zinc-200">{view}</code>
        </pre>
      </div>
      {s.note && <p className="text-xs text-zinc-500">{s.note}</p>}
    </div>
  );
}

function buildTabs(e: ConnEndpoints, pwd: string, apiUrl: string): Tab[] {
  const enc = pwd === PLACEHOLDER ? pwd : encodeURIComponent(pwd);
  const d = e.direct;
  const p = e.pooler;
  // apps usam o pooler (IPv4); sem pooler, a direta
  const app = p ? { host: p.host, user: p.user, db: p.db, port: p.txPort } : { host: d.host, user: d.user, db: d.db, port: d.port };
  const ses = p ? { host: p.host, user: p.user, db: p.db, port: p.sessionPort } : { host: d.host, user: d.user, db: d.db, port: d.port };
  const url = (c: typeof app, extra = "") => `postgresql://${c.user}:${enc}@${c.host}:${c.port}/${c.db}${extra}`;
  const APP_URL = url(app);
  const SES_URL = url(ses);
  const txNote = p ? "Usa o pooler em modo transaction (porta 6543): bom para serverless. Nesse modo, prepared statements ficam desligados." : undefined;

  return [
    {
      key: "env",
      label: ".env",
      intro: "Variáveis prontas para colar no .env do projeto.",
      snippets: [
        {
          lang: ".env",
          code: `# app (pooler transaction, IPv4)\nDATABASE_URL="${url(app, p ? "?pgbouncer=true" : "")}"\n# migrations e conexões longas (pooler session)\nDIRECT_URL="${SES_URL}"\n\n# supabase-js\nNEXT_PUBLIC_SUPABASE_URL="${apiUrl}"\nNEXT_PUBLIC_SUPABASE_ANON_KEY="<anon / publishable key>"`,
          note: "A anon/publishable key aparece no card API, em Mostrar chaves de API.",
        },
      ],
    },
    {
      key: "psql",
      label: "psql",
      snippets: [
        { lang: "bash", code: `psql "${SES_URL}"`, note: "Pooler em modo session (porta 5432): funciona em IPv4 e suporta tudo do psql." },
      ],
    },
    {
      key: "node",
      label: "Node (pg)",
      snippets: [
        { lang: "bash", code: "npm install pg" },
        {
          lang: "js",
          code: `import pg from "pg";\n\nconst pool = new pg.Pool({\n  connectionString: process.env.DATABASE_URL,\n  ssl: { rejectUnauthorized: false },\n});\n\nconst { rows } = await pool.query("select now()");\nconsole.log(rows);`,
          note: "Com DATABASE_URL do .env. Em produção, prefira validar o certificado com o CA do Supabase.",
        },
      ],
    },
    {
      key: "prisma",
      label: "Prisma",
      snippets: [
        {
          title: "schema.prisma",
          lang: "prisma",
          code: `datasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}`,
        },
        {
          title: ".env",
          lang: ".env",
          code: `DATABASE_URL="${url(app, p ? "?pgbouncer=true&connection_limit=1" : "")}"\nDIRECT_URL="${SES_URL}"`,
          note: "url (pooler) para a aplicação; directUrl (session) para prisma migrate.",
        },
      ],
    },
    {
      key: "drizzle",
      label: "Drizzle",
      snippets: [
        { lang: "bash", code: "npm install drizzle-orm postgres" },
        {
          lang: "ts",
          code: `import { drizzle } from "drizzle-orm/postgres-js";\nimport postgres from "postgres";\n\n// prepare: false é obrigatório no pooler em modo transaction\nconst client = postgres(process.env.DATABASE_URL!, { prepare: false });\nexport const db = drizzle(client);`,
          note: txNote,
        },
      ],
    },
    {
      key: "python",
      label: "Python",
      snippets: [
        { title: "psycopg", lang: "bash", code: 'pip install "psycopg[binary]"' },
        {
          lang: "python",
          code: `import psycopg\n\nwith psycopg.connect("${APP_URL}", prepare_threshold=None) as conn:\n    print(conn.execute("select now()").fetchone())`,
        },
        {
          title: "SQLAlchemy",
          lang: "python",
          code: `from sqlalchemy import create_engine, text\nfrom sqlalchemy.pool import NullPool\n\nengine = create_engine("${url(app).replace("postgresql://", "postgresql+psycopg://")}", poolclass=NullPool)\nwith engine.connect() as conn:\n    print(conn.execute(text("select now()")).scalar())`,
          note: txNote,
        },
      ],
    },
    {
      key: "go",
      label: "Go",
      snippets: [
        { lang: "bash", code: "go get github.com/jackc/pgx/v5" },
        {
          lang: "go",
          code: `package main\n\nimport (\n\t"context"\n\t"fmt"\n\n\t"github.com/jackc/pgx/v5"\n)\n\nfunc main() {\n\tcfg, _ := pgx.ParseConfig("${APP_URL}")\n\tcfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol // pooler transaction\n\tconn, err := pgx.ConnectConfig(context.Background(), cfg)\n\tif err != nil {\n\t\tpanic(err)\n\t}\n\tdefer conn.Close(context.Background())\n\n\tvar now string\n\tconn.QueryRow(context.Background(), "select now()::text").Scan(&now)\n\tfmt.Println(now)\n}`,
        },
      ],
    },
    {
      key: "jdbc",
      label: "Java (JDBC)",
      snippets: [
        {
          lang: "jdbc",
          code: `jdbc:postgresql://${app.host}:${app.port}/${app.db}?user=${app.user}&password=${enc}&sslmode=require${p ? "&prepareThreshold=0" : ""}`,
          note: p ? "prepareThreshold=0 desliga prepared statements, exigido pelo pooler em modo transaction." : undefined,
        },
      ],
    },
    {
      key: "dotnet",
      label: ".NET",
      snippets: [
        {
          lang: "Npgsql",
          code: `Host=${app.host};Port=${app.port};Database=${app.db};Username=${app.user};Password=${pwd};SSL Mode=Require${p ? ";No Reset On Close=true;Max Auto Prepare=0" : ""}`,
        },
      ],
    },
    {
      key: "php",
      label: "PHP",
      snippets: [
        {
          lang: "php",
          code: `<?php\n$pdo = new PDO(\n    "pgsql:host=${app.host};port=${app.port};dbname=${app.db};sslmode=require",\n    "${app.user}",\n    "${pwd.replace(/"/g, '\\"')}",\n    [PDO::ATTR_EMULATE_PREPARES => true]\n);\necho $pdo->query("select now()")->fetchColumn();`,
          note: "Laravel: DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME e DB_PASSWORD com estes valores e DB_SSLMODE=require.",
        },
      ],
    },
    {
      key: "supabase-js",
      label: "supabase-js",
      intro: "Para o front ou back usando a API do Supabase (não abre conexão direta com o Postgres).",
      snippets: [
        { lang: "bash", code: "npm install @supabase/supabase-js" },
        {
          lang: "ts",
          code: `import { createClient } from "@supabase/supabase-js";\n\nexport const supabase = createClient(\n  "${apiUrl}",\n  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,\n);`,
          note: "Use a anon/publishable key no front. A service_role/secret só no servidor.",
        },
      ],
    },
  ];
}

/** Abas com as outras formas de conexão (a aba "Connection string" é renderizada pelo painel). */
export function ConnectionTabs({
  endpoints,
  password,
  apiUrl,
  first,
}: {
  endpoints: ConnEndpoints;
  password: string | null;
  apiUrl: string;
  /** conteúdo da 1ª aba (as connection strings) */
  first: ReactNode;
}) {
  const [tab, setTab] = useState("uri");
  const [show, setShow] = useState(false);
  const tabs = buildTabs(endpoints, password ?? PLACEHOLDER, apiUrl);
  const current = tabs.find((t) => t.key === tab);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Formas de conexão">
        {[{ key: "uri", label: "Connection string" }, ...tabs].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "uri" || !current ? (
        first
      ) : (
        <div className="flex flex-col gap-4" role="tabpanel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {current.intro ? <p className="text-sm text-zinc-500">{current.intro}</p> : <span />}
            {password && (
              <button type="button" onClick={() => setShow((v) => !v)} className={buttonClass("ghost", "text-xs")}>
                {show ? "Ocultar senha" : "Mostrar senha"}
              </button>
            )}
          </div>
          {current.snippets.map((s, i) => (
            <CodeBlock key={`${current.key}-${i}`} s={s} password={password} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
