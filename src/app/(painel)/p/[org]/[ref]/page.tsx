import { requireSession } from "@/lib/session";
import { type ConnEndpoints, type ConnString, ConnectionPanel } from "@/components/connection-panel";
import { getPassword } from "@/lib/db";
import { loadProject } from "@/lib/hub";
import { clientFor } from "@/lib/supabase-api";

export default async function ConexaoPage({ params }: PageProps<"/p/[org]/[ref]">) {
  const { org, ref } = await params;
  const session = await requireSession();
  const result = await loadProject(session.tenantId, org, ref);
  if ("error" in result) return null; // o layout já mostra o erro

  const online = result.project.status === "ACTIVE_HEALTHY" || result.project.status === "ACTIVE_UNHEALTHY";
  const [poolers, stored] = await Promise.all([
    online ? clientFor(result.conn).getPooler(ref).catch(() => []) : Promise.resolve([]),
    getPassword(session.tenantId, ref),
  ]);

  const strings: ConnString[] = [];
  const primary = poolers.find((p) => p.database_type === "PRIMARY");
  if (primary) {
    const auth = `${primary.db_user}:[YOUR-PASSWORD]@${primary.db_host}`;
    strings.push(
      {
        label: "Pooler · transaction",
        hint: `porta ${primary.db_port} · serverless, muitas conexões curtas`,
        template: `postgresql://${auth}:${primary.db_port}/${primary.db_name}`,
      },
      {
        label: "Pooler · session",
        hint: "porta 5432 · IPv4, conexões longas",
        template: `postgresql://${auth}:5432/${primary.db_name}`,
      },
    );
  }
  if (online) {
    strings.push({
      label: "Direta",
      hint: "porta 5432 · só IPv6 (sem add-on de IPv4)",
      template: `postgresql://postgres:[YOUR-PASSWORD]@db.${ref}.supabase.co:5432/postgres`,
    });
  }

  // dados estruturados para montar os snippets das abas (Prisma, JDBC, .NET...)
  const endpoints: ConnEndpoints | null = online
    ? {
        pooler: primary ? { host: primary.db_host, user: primary.db_user, db: primary.db_name, txPort: primary.db_port, sessionPort: 5432 } : null,
        direct: { host: `db.${ref}.supabase.co`, user: "postgres", db: "postgres", port: 5432 },
      }
    : null;

  return (
    <ConnectionPanel
      org={org}
      projectRef={ref}
      apiUrl={`https://${ref}.supabase.co`}
      strings={strings}
      endpoints={endpoints}
      passwordInfo={stored ? { source: stored.source, updatedAt: stored.updatedAt } : null}
      online={online}
    />
  );
}
