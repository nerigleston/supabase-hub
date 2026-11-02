import type { Metadata } from "next";
import { Notice } from "@/components/app-ui";
import { type DiagramColumn, type DiagramFk, SchemaDiagram } from "@/components/schema-diagram";
import { resolveAccess } from "@/lib/access";
import { loadProject } from "@/lib/hub";
import { clientFor } from "@/lib/supabase-api";

export const metadata: Metadata = { title: "Diagrama" };

// Diagrama das tabelas e relacionamentos (estilo modelo lógico), só com SQL de leitura.

const SCHEMAS_SQL = `
select n.nspname as schema, count(*)::int as tables
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and n.nspname not like 'pg_temp%'
group by n.nspname
order by (n.nspname = 'public') desc, n.nspname`;

const COLUMNS_SQL = `
select n.nspname as schema,
       c.relname as "table",
       a.attname as "column",
       format_type(a.atttypid, a.atttypmod) as type,
       a.attnotnull as not_null,
       exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisprimary and a.attnum = any (i.indkey)) as pk,
       exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisunique and i.indnatts = 1 and i.indkey[0] = a.attnum) as uniq
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relkind in ('r', 'p') and n.nspname = $1
order by c.relname, a.attnum`;

const FKS_SQL = `
select con.conname as name,
       sn.nspname as src_schema, sc.relname as src_table, sa.attname as src_column,
       tn.nspname as tgt_schema, tc.relname as tgt_table, ta.attname as tgt_column
from pg_constraint con
join pg_class sc on sc.oid = con.conrelid
join pg_namespace sn on sn.oid = sc.relnamespace
join pg_class tc on tc.oid = con.confrelid
join pg_namespace tn on tn.oid = tc.relnamespace
cross join lateral unnest(con.conkey, con.confkey) as k(src, tgt)
join pg_attribute sa on sa.attrelid = con.conrelid and sa.attnum = k.src
join pg_attribute ta on ta.attrelid = con.confrelid and ta.attnum = k.tgt
where con.contype = 'f' and (sn.nspname = $1 or tn.nspname = $1)`;

export default async function DiagramaPage({ params, searchParams }: PageProps<"/p/[org]/[ref]/diagrama">) {
  const { org, ref } = await params;
  const sp = await searchParams;
  const access = await resolveAccess(org, ref);
  if (!access) return null; // o layout já explica
  const result = await loadProject(access.tenant, org, ref);
  if ("error" in result) return null;
  if (result.project.status !== "ACTIVE_HEALTHY" && result.project.status !== "ACTIVE_UNHEALTHY") return null;

  const api = clientFor(result.conn);
  let data: { schema: string; schemas: { schema: string; tables: number }[]; columns: DiagramColumn[]; fks: DiagramFk[] };
  try {
    const schemas = await api.query<{ schema: string; tables: number }>(ref, SCHEMAS_SQL, { readOnly: true });
    const wanted = typeof sp.schema === "string" ? sp.schema : "public";
    const schema = schemas.some((s) => s.schema === wanted) ? wanted : (schemas[0]?.schema ?? "public");
    const [columns, fks] = await Promise.all([
      api.query<DiagramColumn>(ref, COLUMNS_SQL, { readOnly: true, parameters: [schema] }),
      api.query<DiagramFk>(ref, FKS_SQL, { readOnly: true, parameters: [schema] }),
    ]);
    data = { schema, schemas, columns, fks };
  } catch (err) {
    return (
      <Notice tone="error" title="Não foi possível montar o diagrama">
        {err instanceof Error ? err.message : String(err)}
      </Notice>
    );
  }
  return <SchemaDiagram {...data} />;
}
