import type { Metadata } from "next";
import { Card, Kbd, PageHeader, StatusBadge } from "@/components/app-ui";
import { env } from "@/lib/env";
import { STATUS } from "@/lib/status";
import type { ProjectStatus } from "@/lib/supabase-api";

export const metadata: Metadata = { title: "Ajuda" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6 p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</div>
    </Card>
  );
}

export default function AjudaPage() {
  const callback = `${env.appUrl}/api/supabase/callback`;
  return (
    <>
      <PageHeader title="Ajuda" description="Configuração, significado de cada estado e atalhos." />
      <div className="flex max-w-3xl flex-col gap-4">
        <Section id="oauth" title="1. Criar o OAuth App no Supabase (uma vez só)">
          <ol className="list-decimal space-y-2 pl-5">
            <li>No Supabase, abra uma das suas organizações e vá em <strong>Organization Settings → OAuth Apps → Add application</strong>.</li>
            <li>
              Em <strong>Authorization callback URL</strong>, use:{" "}
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{callback}</code>
            </li>
            <li>
              Em <strong>Scopes</strong>, marque: Organizations (Read), Projects (Read e Write), Database (Read e Write) e Secrets (Read).
              Sem Database Write não dá para rodar SQL nem trocar senha; sem Secrets não aparecem as chaves de API.
            </li>
            <li>Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> para o <code>.env.local</code> (SUPABASE_OAUTH_CLIENT_ID e SUPABASE_OAUTH_CLIENT_SECRET) e reinicie o servidor.</li>
          </ol>
          <p>Um único OAuth App serve para conectar todas as contas. Se você mudar os scopes depois, reconecte cada conta.</p>
        </Section>

        <Section id="contas" title="2. Conectar várias contas">
          <p>
            Cada autorização vale para uma organização. O Supabase autoriza com o login que estiver ativo no supabase.com, então para conectar
            um <strong>outro e-mail</strong>: saia do supabase.com (avatar → Log out), clique em <strong>Contas → Conectar conta Supabase</strong> e
            entre com o outro e-mail na tela de login do Supabase.
          </p>
          <p>
            O OAuth do Supabase não informa o e-mail de quem autorizou. O Hub descobre pelos membros da organização: se houver um só membro, é ele;
            se houver vários, use o e-mail que você informou ao conectar (marcado como &quot;não verificado&quot; se não bater).
          </p>
        </Section>

        <Section id="estados" title="O que significa cada estado">
          <ul className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {(Object.keys(STATUS) as ProjectStatus[]).map((s) => (
              <li key={s} className="flex items-start gap-3">
                <span className="w-32 shrink-0"><StatusBadge status={s} /></span>
                <span className="text-xs leading-relaxed text-zinc-500">{STATUS[s].hint}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="vagas" title="Bancos grátis ligados (limite do plano Free)">
          <p>
            No plano grátis, cada <strong>e-mail do Supabase pode ter 2 bancos ligados</strong> ao mesmo tempo, somando todas as organizações
            dele. Bancos pausados e bancos em organizações pagas não contam. Em Contas, cada e-mail mostra &quot;Bancos grátis ligados: 1 de 2 ·
            1 livre&quot;. Em <strong>Novo banco → Escolher automaticamente</strong>, o Hub usa um e-mail que ainda tem espaço. Se o e-mail de
            uma organização não foi identificado, a conta é feita só com ela (estimativa).
          </p>
          <p>
            Projetos Free pausam após cerca de 7 dias sem atividade e podem ser reativados aqui. Seu stack <code>supabase-keepalive</code> continua
            útil para evitar a pausa.
          </p>
        </Section>

        <Section id="keepalive" title="Manter ativo (keep-alive)">
          <p>
            Projetos do plano grátis são pausados pelo Supabase depois de cerca de 7 dias sem atividade no banco. Ligando{" "}
            <strong>Manter ativo</strong> num projeto, o Hub roda um <code>select 1</code> na hora e depois uma vez por dia (06:00 de Brasília).
            Isso conta como atividade e o projeto não pausa. Todos os bancos ligados são pingados juntos, em fila, nesse mesmo horário.
          </p>
          <p>
            <strong>Pingar agora</strong> roda o <code>select 1</code> na hora, mesmo com o interruptor desligado. Para proteger a API do
            Supabase, cada banco aceita 1 ping manual a cada 10 minutos (mais que isso não traz benefício: um ping já zera a contagem de 7 dias).
          </p>
          <p>
            Se o projeto já estiver pausado, o ping falha e o painel avisa: reative primeiro. Lembre que projeto mantido ativo continua
            contando como 1 dos 2 bancos grátis ligados do e-mail.
          </p>
        </Section>

        <Section id="senha" title="Senha e connection string">
          <p>
            O Supabase não devolve a senha atual do banco por API. O painel só conhece a senha se o projeto foi criado aqui, se a senha foi
            redefinida aqui, ou se você a informou na aba <strong>Conexão</strong> (o painel testa a senha antes de guardar). As senhas ficam
            criptografadas (AES-256-GCM) no DynamoDB.
          </p>
          <p><strong>Redefinir a senha derruba as aplicações que usam a senha antiga</strong> até você atualizá-las.</p>
        </Section>

        <Section id="sql" title="Editor SQL">
          <p>
            Por padrão o editor roda em <strong>modo somente leitura</strong>. Para alterar dados ou estrutura, desligue o modo; comandos como DROP,
            TRUNCATE, DELETE e UPDATE pedem confirmação. Todo SQL de escrita fica registrado em Atividade.
          </p>
        </Section>

        <Section id="atalhos" title="Atalhos">
          <ul className="space-y-1">
            <li><Kbd>/</Kbd> buscar projetos na visão geral</li>
            <li><Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> executar SQL</li>
            <li><Kbd>Esc</Kbd> fechar diálogos e cancelar edição</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
