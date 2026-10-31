import { requireSession } from "@/lib/session";
import type { Metadata } from "next";
import { EmptyState, PageHeader, Tone } from "@/components/app-ui";
import { listLogs } from "@/lib/db";

export const metadata: Metadata = { title: "Atividade" };

const ACTIONS: Record<string, string> = {
  conectar_conta: "Conectou conta",
  reconectar_conta: "Reconectou conta",
  desconectar_conta: "Desconectou conta",
  reativar: "Reativou projeto",
  pausar: "Pausou projeto",
  criar_projeto: "Criou projeto",
  redefinir_senha: "Redefiniu senha do banco",
  salvar_senha: "Guardou senha do banco",
  ver_senha: "Viu senha do banco",
  ver_chaves_api: "Viu chaves de API",
  executar_sql: "Executou SQL",
  conectar_login: "Conectou login (Access Token)",
  atualizar_token: "Atualizou Access Token",
  remover_login: "Removeu login",
  ligar_keepalive: "Ligou keep-alive",
  desligar_keepalive: "Desligou keep-alive",
  keepalive_falhou: "Keep-alive diário falhou",
};

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function AtividadePage() {
  const session = await requireSession();
  const logs = await listLogs(session.tenantId, 200);
  return (
    <>
      <PageHeader title="Atividade" description="Tudo o que foi feito pelo painel nos últimos 90 dias: quem, o quê, quando e se deu certo." />
      {logs.length === 0 ? (
        <EmptyState title="Nenhuma atividade ainda">As ações feitas no painel aparecem aqui.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase dark:border-zinc-800">
              <tr>
                <th className="px-4 py-2.5 font-medium">Quando</th>
                <th className="px-4 py-2.5 font-medium">Ação</th>
                <th className="px-4 py-2.5 font-medium">Alvo</th>
                <th className="px-4 py-2.5 font-medium">Resultado</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {logs.map((l, i) => (
                <tr key={i} className="align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-zinc-500 tabular-nums">{fmt.format(new Date(l.at))}</td>
                  <td className="px-4 py-2.5">{ACTIONS[l.action] ?? l.action}</td>
                  <td className="px-4 py-2.5">
                    {l.target}
                    {l.detail && (
                      <details className="mt-1 text-xs text-zinc-500">
                        <summary className="cursor-pointer">Detalhes</summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto font-mono whitespace-pre-wrap">{l.detail}</pre>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{l.ok ? <Tone tone="ok">Sucesso</Tone> : <Tone tone="error">Falhou</Tone>}</td>
                  <td className="hidden px-4 py-2.5 text-zinc-500 md:table-cell">{l.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
