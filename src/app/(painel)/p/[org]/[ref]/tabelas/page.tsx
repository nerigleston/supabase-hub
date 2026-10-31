import { type TableInfo, TableBrowser } from "@/components/table-browser";
import { Notice } from "@/components/app-ui";
import { loadProject } from "@/lib/hub";
import { requireSession } from "@/lib/session";
import { clientFor } from "@/lib/supabase-api";

const TABLES_SQL = `
select n.nspname as schema,
       c.relname as name,
       c.reltuples::bigint as estimated_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) as size,
       c.relrowsecurity as rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  and n.nspname not like 'pg_temp%'
order by (n.nspname = 'public') desc, n.nspname, c.relname`;

export default async function TabelasPage({ params }: PageProps<"/p/[org]/[ref]/tabelas">) {
  const { org, ref } = await params;
  const session = await requireSession();
  const result = await loadProject(session.tenantId, org, ref);
  if ("error" in result) return null;
  if (result.project.status !== "ACTIVE_HEALTHY" && result.project.status !== "ACTIVE_UNHEALTHY") return null;

  let tables: TableInfo[];
  try {
    tables = await clientFor(result.conn).query<TableInfo>(ref, TABLES_SQL, { readOnly: true });
  } catch (err) {
    return (
      <Notice tone="error" title="Não foi possível listar as tabelas">
        {err instanceof Error ? err.message : String(err)}
      </Notice>
    );
  }

  return <TableBrowser org={org} projectRef={ref} tables={tables.map((t) => ({ ...t, estimated_rows: Number(t.estimated_rows) }))} />;
}
