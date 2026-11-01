import type { Connection } from "@/lib/db";
import { getDescription } from "@/lib/db";
import { diffSchema, schemaSnapshot } from "@/lib/describe";
import { env } from "@/lib/env";
import { ProjectDescription, type StaleInfo } from "./project-description";

// Parte servidor do card "Sobre este banco": carrega a descrição e, se o banco estiver
// no ar, compara o esquema atual com o da última revisão (sem IA, sem token).
export async function ProjectDescriptionSection({
  tenant,
  conn,
  org,
  projectRef,
  online,
  canEdit = true,
}: {
  tenant: string;
  conn: Connection;
  org: string;
  projectRef: string;
  online: boolean;
  /** papel Leitura só lê a descrição */
  canEdit?: boolean;
}) {
  const desc = await getDescription(tenant, projectRef);
  let stale: StaleInfo = null;
  if (desc?.fingerprint && online) {
    const snap = await schemaSnapshot(conn, projectRef).catch(() => null);
    if (snap && snap.fingerprint !== desc.fingerprint) {
      const d = diffSchema(desc.tables, snap.tables);
      stale = { added: d.addedTables, removed: d.removedTables, changed: d.changedTables };
    }
  }
  return (
    <ProjectDescription
      org={org}
      projectRef={projectRef}
      initial={desc ? { text: desc.text, source: desc.source, updatedAt: desc.updatedAt, updatedBy: desc.updatedBy } : null}
      stale={stale}
      aiEnabled={env.aiEnabled}
      online={online}
      canEdit={canEdit}
    />
  );
}
