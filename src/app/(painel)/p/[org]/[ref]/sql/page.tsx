import { SqlEditor } from "@/components/sql-editor";
import { loadProject } from "@/lib/hub";
import { requireSession } from "@/lib/session";

export default async function SqlPage({ params, searchParams }: PageProps<"/p/[org]/[ref]/sql">) {
  const [{ org, ref }, { q }] = await Promise.all([params, searchParams]);
  const session = await requireSession();
  const result = await loadProject(session.tenantId, org, ref);
  if ("error" in result) return null;
  if (result.project.status !== "ACTIVE_HEALTHY" && result.project.status !== "ACTIVE_UNHEALTHY") return null;

  return <SqlEditor org={org} projectRef={ref} projectName={result.project.name} initial={typeof q === "string" ? q : undefined} />;
}
