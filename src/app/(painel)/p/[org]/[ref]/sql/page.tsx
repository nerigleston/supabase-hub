import { SqlEditor } from "@/components/sql-editor";
import { resolveAccess } from "@/lib/access";
import { loadProject } from "@/lib/hub";
import { can } from "@/lib/roles";

export default async function SqlPage({ params, searchParams }: PageProps<"/p/[org]/[ref]/sql">) {
  const [{ org, ref }, { q }] = await Promise.all([params, searchParams]);
  const access = await resolveAccess(org, ref);
  if (!access) return null; // o layout já explica
  const result = await loadProject(access.tenant, org, ref);
  if ("error" in result) return null;
  if (result.project.status !== "ACTIVE_HEALTHY" && result.project.status !== "ACTIVE_UNHEALTHY") return null;

  return <SqlEditor org={org} projectRef={ref} projectName={result.project.name} initial={typeof q === "string" ? q : undefined} canWrite={can.write(access.role)} />;
}
