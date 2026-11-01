import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, Notice, PageHeader, Stat, Tone } from "@/components/app-ui";
import { ProjectsTable } from "@/components/projects-table";
import { loadHub } from "@/lib/hub";
import { requireSession } from "@/lib/session";
import { FREE_PLAN_ACTIVE_LIMIT } from "@/lib/status";

export const metadata: Metadata = { title: "Organização" };

// Detalhe de uma organização: bancos dela (mesma tabela da visão geral) e vagas do e-mail.
export default async function OrgPage({ params }: PageProps<"/contas/[org]">) {
  const { org } = await params;
  const session = await requireSession();
  const { accounts, projects, logins } = await loadHub(session.tenantId);
  const account = accounts.find((a) => a.orgSlug === org);
  if (!account) notFound();

  const rows = projects.filter((p) => p.accountSlug === org);
  const free = !account.plan || account.plan.toLowerCase() === "free";
  const plan = account.plan ? account.plan[0].toUpperCase() + account.plan.slice(1) : "?";
  const loginSummary = logins.find((l) => l.orgSlugs.includes(org));
  const siblings = loginSummary ? loginSummary.orgSlugs.filter((s) => s !== org).length : 0;
  const paused = rows.filter((p) => p.status === "INACTIVE").length;
  const kept = rows.filter((p) => p.keepAlive?.enabled).length;

  return (
    <>
      <nav aria-label="Você está em" className="mb-2 text-xs text-zinc-500">
        <Link href="/contas" className="hover:underline">Contas</Link> / {account.name}
      </nav>
      <PageHeader
        title={account.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{account.orgSlug}</span>
            <span>·</span>
            <span>{account.login ?? "e-mail não identificado"}</span>
            {account.error ? <Tone tone="error">{account.status === "reauth" ? "Reconectar" : "Erro"}</Tone> : <Tone tone="ok">Conectada</Tone>}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/novo?org=${encodeURIComponent(account.orgSlug)}`} className={buttonClass("primary")}>+ Criar banco aqui</Link>
            <a href={`https://supabase.com/dashboard/org/${account.orgSlug}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              Abrir no Supabase ↗
            </a>
          </div>
        }
      />

      {account.error && (
        <Notice tone="error" title="Não foi possível ler esta organização">
          {account.error}{" "}
          <Link href="/contas" className="font-medium underline">Reconectar em Contas</Link>
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Plano" value={plan} hint={free ? "Grátis: usa as vagas do e-mail" : "Pago: sem limite de bancos grátis"} />
        <Stat label="Bancos" value={rows.length} hint={`${kept} com Manter ativo`} />
        <Stat label="Pausados" value={paused} tone={paused ? "paused" : undefined} hint={paused ? "Reative na tabela abaixo" : "Nenhum pausado"} />
        {free && account.freeSlots !== null ? (
          <Stat
            label="Vagas para banco grátis"
            value={account.freeSlots}
            tone={account.freeSlots ? "ok" : "error"}
            hint={
              account.blockedBy?.length
                ? `Bloqueada: ${account.blockedBy.join(", ")} já ${account.blockedBy.length > 1 ? "têm" : "tem"} ${FREE_PLAN_ACTIVE_LIMIT} ligados`
                : loginSummary
                  ? `${loginSummary.activeFree} de ${FREE_PLAN_ACTIVE_LIMIT} ligados no e-mail${siblings ? `, somando ${siblings} outra(s) org(s)` : ""}`
                  : "Conta pelos donos e admins da organização"
            }
          />
        ) : (
          <Stat label="Vagas grátis" value="∞" hint="Org paga" />
        )}
      </div>

      <section aria-label="Bancos da organização">
        <h2 className="mb-3 font-semibold">Bancos</h2>
        <ProjectsTable projects={rows} accounts={[{ slug: account.orgSlug, name: account.name }]} />
      </section>
    </>
  );
}
