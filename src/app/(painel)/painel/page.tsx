import { requireSession } from "@/lib/session";
import Link from "next/link";
import { enableKeepAliveForAllAction } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConfirmAction } from "@/components/confirm-action";
import { ProjectsTable } from "@/components/projects-table";
import { buttonClass, EmptyState, Notice, PageHeader, Stat } from "@/components/app-ui";
import { loadHub } from "@/lib/hub";
import { BUSY_STATUSES } from "@/lib/status";

export default async function OverviewPage() {
  const session = await requireSession();
  const { accounts, projects, logins: loginList, loadedAt } = await loadHub(session.tenantId);

  const paused = projects.filter((p) => p.status === "INACTIVE").length;
  const busy = projects.some((p) => BUSY_STATUSES.has(p.status));
  const kept = projects.filter((p) => p.keepAlive?.enabled).length;
  const keepCandidates = projects.filter(
    (p) => !p.keepAlive?.enabled && (p.status === "ACTIVE_HEALTHY" || p.status === "ACTIVE_UNHEALTHY"),
  ).length;
  const problems = accounts.filter((a) => a.error);
  // 2 projetos ativos Free por login Supabase (não por organização)
  const freeSlots = loginList.reduce((sum, l) => sum + l.freeSlots, 0);
  const logins = loginList.length;

  return (
    <>
      <PageHeader
        title="Visão geral"
        description={
          accounts.length
            ? `${logins} login(s) Supabase · ${accounts.length} organização(ões) · ${projects.length} projeto(s), tudo em um só lugar.`
            : "Todos os projetos de todas as suas contas Supabase, em um só lugar."
        }
        actions={
          <>
            <Link href="/novo" className={buttonClass("primary")}>+ Novo banco</Link>
            <Link href="/contas" className={buttonClass("secondary")}>Conectar conta</Link>
          </>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta Supabase conectada"
          action={<Link href="/contas" className={buttonClass("primary")}>Conectar a primeira conta</Link>}
        >
          Conecte suas contas pelo OAuth do Supabase. Depois disso, todos os projetos aparecem aqui com o estado de cada um.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {problems.map((a) => (
            <Notice
              key={a.orgSlug}
              tone="error"
              title={`Não foi possível ler a conta "${a.name}"`}
              action={
                a.status === "reauth" ? (
                  <a href={a.authKind === "pat" ? "/contas?conectar=token" : "/api/supabase/connect"} className={buttonClass("secondary")}>
                    {a.authKind === "pat" ? "Colar token novo" : "Reconectar"}
                  </a>
                ) : undefined
              }
            >
              {a.error} As outras contas foram carregadas normalmente.
            </Notice>
          ))}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Logins Supabase" value={logins} hint={`${accounts.length} organização(ões), ${accounts.length - problems.length} respondendo`} />
            <Stat label="Projetos" value={projects.length} hint={`${kept} mantido(s) ativo(s) por keep-alive`} />
            <Stat label="Pausados" value={paused} tone={paused ? "paused" : undefined} hint={paused ? "Precisam de reativação" : "Nenhum pausado"} />
            <Stat
              label="Bancos grátis livres"
              value={freeSlots}
              tone={freeSlots ? "ok" : "error"}
              hint="Quantos ainda dá para ligar, somando os e-mails (2 por e-mail)"
            />
          </div>

          <section aria-labelledby="projetos">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="projetos" className="font-semibold">Projetos</h2>
              <div className="flex flex-wrap items-center gap-3">
                {keepCandidates > 0 && (
                  <ConfirmAction
                    label={`Manter ativos (${keepCandidates})`}
                    variant="secondary"
                    pendingLabel="Pingando…"
                    confirm={{
                      title: `Ligar keep-alive em ${keepCandidates} projeto(s) no ar?`,
                      body: (
                        <>
                          Cada um recebe um <code>select 1</code> agora e depois uma vez por dia, para o Supabase não pausar por inatividade.
                          Você pode desligar projeto a projeto na coluna <strong>Manter ativo</strong>.
                        </>
                      ),
                      confirmLabel: "Ligar em todos",
                    }}
                    action={enableKeepAliveForAllAction}
                  />
                )}
                <AutoRefresh busy={busy} loadedAt={loadedAt} />
              </div>
            </div>
            <ProjectsTable projects={projects} accounts={accounts.map((a) => ({ slug: a.orgSlug, name: a.name }))} />
          </section>
        </div>
      )}
    </>
  );
}
