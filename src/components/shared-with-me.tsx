import Link from "next/link";
import { getConnection } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/roles";
import { listSharedWithMe } from "@/lib/shares";
import { regionLabel } from "@/lib/status";
import { clientFor, type Project } from "@/lib/supabase-api";
import { StatusBadge } from "./app-ui";

// Bancos que outras contas compartilharam com este usuário (lidos com a conexão do dono).
export async function SharedWithMe({ tenant }: { tenant: string }) {
  const shared = await listSharedWithMe(tenant);
  if (!shared.length) return null;

  const rows = await Promise.all(
    shared.map(async (s) => {
      let project: Project | null = null;
      try {
        const conn = await getConnection(s.ownerTenant, s.orgSlug);
        if (conn) project = await clientFor(conn).getProject(s.ref);
      } catch {}
      return { s, project };
    }),
  );

  return (
    <section aria-labelledby="compartilhados" className="flex flex-col gap-3">
      <div>
        <h2 id="compartilhados" className="font-semibold">Compartilhados comigo</h2>
        <p className="text-sm text-zinc-500">Bancos de outras contas do BaseHub que você acessa por convite.</p>
      </div>
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {rows.map(({ s, project }) => (
          <li key={s.ref} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <Link href={`/p/${s.orgSlug}/${s.ref}`} className="block truncate text-sm font-medium hover:underline">
                {project?.name ?? s.projectName}
              </Link>
              <span className="block truncate text-xs text-zinc-500">
                de {s.ownerEmail}
                {project ? ` · ${regionLabel(project.region)}` : ""} · <span className="font-mono">{s.ref}</span>
              </span>
            </div>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">{ROLE_LABEL[s.role]}</span>
            {project ? <StatusBadge status={project.status} /> : <span className="text-xs text-rose-600 dark:text-rose-400">Indisponível</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
