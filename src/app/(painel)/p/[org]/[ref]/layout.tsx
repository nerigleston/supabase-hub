import Link from "next/link";
import { Suspense } from "react";
import { ProjectDescriptionSection } from "@/components/project-description-section";
import { pauseProjectAction, restoreProjectAction } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfirmAction } from "@/components/confirm-action";
import { KeepAliveToggle } from "@/components/keepalive-toggle";
import { PingNowButton } from "@/components/ping-now-button";
import { ProjectTabs } from "@/components/project-tabs";
import { listKeepAlive } from "@/lib/db";
import { buttonClass, Notice, StatusBadge } from "@/components/app-ui";
import { resolveAccess } from "@/lib/access";
import { loadProject } from "@/lib/hub";
import { can, ROLE_LABEL } from "@/lib/roles";
import { leaveAction } from "@/app/share-actions";
import { BUSY_STATUSES, regionLabel } from "@/lib/status";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[org]/[ref]">) {
  const { org, ref } = await params;
  const access = await resolveAccess(org, ref);
  const result = access ? await loadProject(access.tenant, org, ref) : { error: "Você não tem acesso a este banco. Se alguém compartilhou com você, abra o link do convite que chegou por e-mail." };
  const base = `/p/${org}/${ref}`;

  const breadcrumb = (
    <nav aria-label="Você está em" className="mb-2 text-xs text-zinc-500">
      <Link href="/painel" className="hover:underline">Visão geral</Link> <span aria-hidden>/</span>{" "}
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
          action={<Link href="/painel" className={buttonClass("secondary")}>Voltar</Link>}
        >
          {result.error}
        </Notice>
      </>
    );
  }

  const { project, conn } = result;
  const { role, shared } = access!;
  const canWrite = can.write(role);
  const ka = (await listKeepAlive(access!.tenant)).find((k) => k.ref === ref);
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
            {shared && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                Compartilhado por {shared.ownerEmail} · {ROLE_LABEL[role]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {conn.label || conn.orgName} · {regionLabel(project.region)}
            {project.database?.version && ` · Postgres ${project.database.version}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {paused && canWrite && (
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
          {active && canWrite && (
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
          {!shared && (
            <a href={`https://supabase.com/dashboard/project/${ref}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "py-2")}>
              Abrir no Supabase ↗
            </a>
          )}
          {shared && (
            <ConfirmAction
              label="Sair deste banco"
              variant="ghost"
              size="md"
              confirm={{
                title: `Sair de "${project.name}"?`,
                body: "Você perde o acesso a este banco no BaseHub e no MCP. Para voltar, alguém precisa convidar você de novo.",
                confirmLabel: "Sair do banco",
                danger: true,
              }}
              action={leaveAction.bind(null, org, ref)}
            />
          )}
        </div>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
        {canWrite && (
        <KeepAliveToggle
          key={`${ka?.lastPingAt ?? ""}-${ka?.enabled ?? ""}`}
          org={org}
          projectRef={ref}
          name={project.name}
          value={ka ? { enabled: ka.enabled, lastPingAt: ka.lastPingAt, lastOk: ka.lastOk, lastError: ka.lastError, lastManualPingAt: ka.lastManualPingAt } : undefined}
          disabled={!ka?.enabled && !active}
          showLabel
        />
        )}
        {active && canWrite && <PingNowButton org={org} projectRef={ref} name={project.name} lastManualPingAt={ka?.lastManualPingAt} />}
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
      <Suspense fallback={<div className="mb-4 h-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" aria-hidden />}>
        <ProjectDescriptionSection tenant={access!.tenant} conn={conn} org={org} projectRef={ref} online={active} canEdit={canWrite} />
      </Suspense>
      <ProjectTabs base={base} canManage={can.manage(role)} />
      {children}
    </>
  );
}
