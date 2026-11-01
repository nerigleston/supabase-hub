import { Card, Notice } from "@/components/app-ui";
import { type MemberView, ShareManager } from "@/components/share-manager";
import { resolveAccess } from "@/lib/access";
import { listLogs } from "@/lib/db";
import { emailEnabled } from "@/lib/email";
import { getPlan, hasPro, plansEnabled } from "@/lib/plans";
import { can } from "@/lib/roles";
import { listMembers } from "@/lib/shares";

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const ACTION_LABEL: Record<string, string> = {
  convidar: "Convidou",
  reenviar_convite: "Reenviou convite",
  cancelar_convite: "Cancelou convite",
  aceitar_convite: "Aceitou o convite",
  recusar_convite: "Recusou o convite",
  mudar_papel: "Mudou o papel",
  revogar_acesso: "Revogou acesso",
  sair_do_banco: "Saiu do banco",
  executar_sql: "SQL de escrita",
  ver_senha: "Viu a senha",
  ver_chaves_api: "Viu as chaves de API",
  redefinir_senha: "Redefiniu a senha",
  reativar: "Reativou",
  pausar: "Pausou",
  ligar_keepalive: "Ligou manter ativo",
  desligar_keepalive: "Desligou manter ativo",
  salvar_descricao: "Salvou a descrição",
  descrever_banco: "Gerou descrição com IA",
  mcp_convidado: "Mudou as ações do MCP de convidado",
  mcp_connection_strings: "Viu connection strings (MCP)",
  mcp_ping_project: "Pingou (MCP)",
  mcp_restore_project: "Reativou (MCP)",
  mcp_pause_project: "Pausou (MCP)",
};

// Quem tem acesso a este banco, convites e histórico. Só dono e Admin.
export default async function AcessoPage({ params }: PageProps<"/p/[org]/[ref]/acesso">) {
  const { org, ref } = await params;
  const access = await resolveAccess(org, ref);
  if (!access) return null; // o layout já explica
  if (!can.manage(access.role))
    return <Notice tone="info" title="Só o dono ou um Admin gerencia o acesso">Seu papel neste banco não permite convidar nem revogar pessoas.</Notice>;

  const [members, logs, plan] = await Promise.all([listMembers(access.tenant, ref), listLogs(access.tenant, 400), getPlan(access.tenant)]);
  const owner = access.shared ? access.shared.ownerEmail : access.session.email;
  const blocked = plansEnabled() && !hasPro(plan) ? "Compartilhar bancos é do plano Pro ou Business. O dono deste banco precisa fazer o upgrade em Plano." : null;
  const now = new Date().getTime();
  const history = logs.filter((l) => l.target.includes(ref)).slice(0, 60);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {!emailEnabled() && (
          <Notice tone="warn" title="Envio de e-mail desligado">
            Sem RESEND_API_KEY os convites não saem por e-mail; o link aparece aqui para você enviar.
          </Notice>
        )}
        <ShareManager
          org={org}
          projectRef={ref}
          me={access.session.email.toLowerCase()}
          owner={owner}
          blocked={blocked}
          members={members.map<MemberView>((m) => ({
            email: m.email,
            role: m.role,
            status: m.status,
            invitedBy: m.invitedBy,
            invitedAt: m.invitedAt,
            acceptedAt: m.acceptedAt,
            inviteExpiresAt: m.inviteExpiresAt,
            mcpTools: m.mcpTools,
            expired: m.status === "pending" && !!m.inviteExpiresAt && new Date(m.inviteExpiresAt).getTime() < now,
          }))}
        />
      </div>
      <Card className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="font-semibold">Histórico deste banco</h2>
          <p className="mt-1 text-xs text-zinc-500">Convites, acessos e ações de quem usa o banco (inclusive convidados).</p>
        </div>
        {history.length ? (
          <ol className="flex flex-col gap-2.5">
            {history.map((l) => (
              <li key={`${l.at}-${l.action}-${l.user}`} className="text-sm">
                <span className={`font-medium ${l.ok ? "" : "text-rose-600 dark:text-rose-400"}`}>{ACTION_LABEL[l.action] ?? l.action}</span>
                <span className="text-zinc-500"> · {l.user}</span>
                <span className="block text-xs text-zinc-500">
                  {fmt.format(new Date(l.at))}
                  {l.detail && !l.detail.includes("→") ? ` · ${l.detail}` : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">Nada registrado ainda.</p>
        )}
      </Card>
    </div>
  );
}
