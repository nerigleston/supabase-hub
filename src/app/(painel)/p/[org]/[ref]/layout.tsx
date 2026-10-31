import { requireSession } from "@/lib/session";
import Link from "next/link";
import { pauseProjectAction, restoreProjectAction } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfirmAction } from "@/components/confirm-action";
import { KeepAliveToggle } from "@/components/keepalive-toggle";
import { PingNowButton } from "@/components/ping-now-button";
import { ProjectTabs } from "@/components/project-tabs";
import { listKeepAlive } from "@/lib/db";
import { buttonClass, Notice, StatusBadge } from "@/components/app-ui";
import { loadProject } from "@/lib/hub";
import { BUSY_STATUSES, regionLabel } from "@/lib/status";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[org]/[ref]">) {
  const { org, ref } = await params;
  const session = await requireSession();
  const result = await loadProject(session.tenantId, org, ref);
  const base = `/p/${org}/${ref}`;

  const breadcrumb = (
    <nav aria-label="Você está em" className="mb-2 text-xs text-zinc-500">
      <Link href="/" className="hover:underline">Visão geral</Link> <span aria-hidden>/</span>{" "}
      <span>{"conn" in result && result.conn ? result.conn.label || result.conn.orgName : org}</span> <span aria-hidden>/</span>{" "}
      <span className="font-mono">{ref}</span>
    </nav>
  );

  if ("error" in result) {
    return (
      <>
        {breadcrumb}
        <Notice
          tone="error"
          title="Não foi possível abrir este projeto"
          action={<Link href="/" className={buttonClass("secondary")}>Voltar</Link>}
        >
          {result.error}
        </Notice>
      </>
    );
  }

  const { project, conn } = result;
  const ka = (await listKeepAlive(session.tenantId)).find((k) => k.ref === ref);
  const paused = project.status === "INACTIVE" || project.status === "RESTORE_FAILED";
  const active = project.status === "ACTIVE_HEALTHY" || project.status === "ACTIVE_UNHEALTHY";

  return (
    <>
      {breadcrumb}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {conn.label || conn.orgName} · {regionLabel(project.region)}
            {project.database?.version && ` · Postgres ${project.database.version}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {paused && (
            <ConfirmAction
              label="Reativar"
              variant="primary"
              size="md"
              pendingLabel="Reativando…"
              confirm={{
                title: `Reativar "${project.name}"?`,
                body: `O projeto volta ao ar em 2 a 5 minutos, com os dados intactos. No plano grátis passa a contar como 1 dos 2 bancos ligados do e-mail${conn.login ? ` ${conn.login}` : ""}.`,
                confirmLabel: "Reativar agora",
              }}
              action={restoreProjectAction.bind(null, org, ref, project.name)}
            />
          )}
          {active && (
            <ConfirmAction
              label="Pausar"
              variant="secondary"
              size="md"
              pendingLabel="Pausando…"
              confirm={{
                title: `Pausar "${project.name}"?`,
                body: (
                  <>
                    O banco e as APIs ficam <strong>fora do ar</strong> para as aplicações até você reativar. Os dados são mantidos. Use para
                    liberar espaço para outro banco grátis nesse e-mail.
                  </>
                ),
                confirmLabel: "Pausar projeto",
                danger: true,
                typeToConfirm: project.name,
              }}
              action={pauseProjectAction.bind(null, org, ref, project.name)}
            />
          )}
          <a href={`https://supabase.com/dashboard/project/${ref}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "py-2")}>
            Abrir no Supabase ↗
          </a>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
        <KeepAliveToggle
          key={`${ka?.lastPingAt ?? ""}-${ka?.enabled ?? ""}`}
          org={org}
          projectRef={ref}
          name={project.name}
          value={ka ? { enabled: ka.enabled, lastPingAt: ka.lastPingAt, lastOk: ka.lastOk, lastError: ka.lastError, lastManualPingAt: ka.lastManualPingAt } : undefined}
          disabled={!ka?.enabled && !active}
          showLabel
        />
        {active && <PingNowButton org={org} projectRef={ref} name={project.name} lastManualPingAt={ka?.lastManualPingAt} />}
        </div>
        <AutoRefresh busy={BUSY_STATUSES.has(project.status)} loadedAt={result.loadedAt} />
      </div>
      {paused && (
        <div className="mb-4">
          <Notice tone="warn" title="Projeto pausado">
            Tabelas, SQL e connection strings só funcionam com o projeto no ar. Reative para usar.
          </Notice>
        </div>
      )}
      <ProjectTabs base={base} />
      {children}
    </>
  );
}
