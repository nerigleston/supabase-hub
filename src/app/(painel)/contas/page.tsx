import type { Metadata } from "next";
import Link from "next/link";
import { removeLoginAction } from "@/app/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { AccountCard } from "@/components/account-card";
import { ConnectDialog } from "@/components/connect-dialog";
import { CreateOrgButton } from "@/components/create-org-button";
import { buttonClass, Card, EmptyState, FreeMeter, Notice, PageHeader, Tone } from "@/components/app-ui";
import { env } from "@/lib/env";
import { type AccountView, loadHub } from "@/lib/hub";
import { orgUsage } from "@/lib/plans";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Contas" };

const ERRORS: Record<string, { title: string; body: string }> = {
  oauth_nao_configurado: {
    title: "OAuth do Supabase ainda não configurado",
    body: "Preencha SUPABASE_OAUTH_CLIENT_ID e SUPABASE_OAUTH_CLIENT_SECRET no .env.local e reinicie o servidor. O passo a passo está em Ajuda.",
  },
  negado: { title: "Autorização cancelada", body: "Você não autorizou o acesso no Supabase. Nada foi alterado." },
  expirado: { title: "A conexão expirou", body: "O fluxo demorou mais de 10 minutos ou foi aberto em outra aba. Clique em Conectar conta de novo." },
  sem_org: { title: "Nenhuma organização autorizada", body: "Na tela do Supabase, escolha a organização antes de autorizar." },
  falha: { title: "Não foi possível concluir a conexão", body: "O Supabase recusou a troca de tokens. Confira o client secret e a URL de callback do OAuth App." },
};

type LoginGroup = { login?: string; verified: boolean; pat: boolean; accounts: AccountView[] };

function groupByLogin(accounts: AccountView[]): LoginGroup[] {
  const map = new Map<string, LoginGroup>();
  for (const a of accounts) {
    const key = a.login ?? "";
    const g = map.get(key) ?? { login: a.login, verified: true, pat: false, accounts: [] };
    g.accounts.push(a);
    g.pat ||= a.authKind === "pat";
    g.verified &&= Boolean(a.loginVerified);
    map.set(key, g);
  }
  // logins identificados primeiro, "não identificado" por último
  return [...map.values()].sort((a, b) => (a.login ? 0 : 1) - (b.login ? 0 : 1) || (a.login ?? "").localeCompare(b.login ?? ""));
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ContasPage({ searchParams }: PageProps<"/contas">) {
  const sp = await searchParams;
  const session = await requireSession();
  const { accounts, loginErrors } = await loadHub(session.tenantId);
  // depois do loadHub: a sincronização dos tokens pode ter adicionado organizações
  const usage = await orgUsage(session.tenantId);
  const atLimit = usage.limit !== null && usage.used >= usage.limit;
  const upgrade = env.upgradeUrl;
  const configured = env.supabase.configured;
  const error = str(sp.erro) ? ERRORS[str(sp.erro)!] : undefined;
  const groups = groupByLogin(accounts);
  const knownLogins = groups.flatMap((g) => (g.login ? [g.login] : []));

  const autoOpen = sp.conectar === "token" || sp.conectar === "oauth" ? sp.conectar : undefined;
  const connect = <ConnectDialog disabled={!configured} knownLogins={knownLogins} autoOpen={autoOpen} />;

  return (
    <>
      <PageHeader
        title="Contas"
        description="Conecte contas Supabase de vários e-mails. Cada login pode ter várias organizações, e cada organização aparece aqui agrupada pelo login de origem."
        actions={connect}
      />

      <div className="flex flex-col gap-4">
        {usage.limit !== null && (
          <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                Plano Grátis · {Math.min(usage.used, usage.limit)} de {usage.limit} organizações
                {usage.used > usage.limit && <span className="font-normal text-zinc-500"> (+{usage.used - usage.limit} de antes do limite)</span>}
              </p>
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
                <div
                  className={`h-full rounded-full ${atLimit ? "bg-amber-500" : "bg-emerald-600"}`}
                  style={{ width: `${Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                {atLimit ? "Limite atingido. No Pro, as organizações são ilimitadas." : "No Pro, as organizações são ilimitadas."}
              </p>
            </div>
            {upgrade && <a href={upgrade} className={buttonClass(atLimit ? "primary" : "secondary")}>Fazer upgrade para o Pro</a>}
          </Card>
        )}
        {str(sp.limite) && (
          <Notice
            tone="warn"
            title="Algumas organizações ficaram de fora"
            action={upgrade ? <a href={upgrade} className={buttonClass("secondary")}>Fazer upgrade</a> : undefined}
          >
            {str(sp.limite)} não {str(sp.limite)!.includes(",") ? "foram conectadas" : "foi conectada"}: o plano Grátis permite até {usage.limit ?? 0}{" "}
            organizações. Desconecte uma que não usa mais ou faça upgrade para o Pro.
          </Notice>
        )}
        {Object.entries(loginErrors).map(([email, message]) => (
          <Notice
            key={email}
            tone="error"
            title={`O token de ${email} não funciona mais`}
            action={<Link href="/contas?conectar=token" className={buttonClass("secondary")}>Colar token novo</Link>}
          >
            {message} As organizações desse login podem estar desatualizadas.
          </Notice>
        ))}
        {error && <Notice tone="error" title={error.title}>{error.body}</Notice>}
        {str(sp.conectada) && (
          <Notice tone="ok" title="Organização conectada">
            {str(sp.conectada)} já aparece na visão geral.
          </Notice>
        )}
        {str(sp.renovada) && !str(sp.conectada) && sp.mesmo_login === undefined && (
          <Notice tone="info" title="Acesso renovado">{str(sp.renovada)} já estava conectada; o acesso foi renovado.</Notice>
        )}
        {sp.mesmo_login !== undefined && (
          <Notice tone="warn" title="O Supabase usou um login que já estava conectado">
            Só voltaram organizações já conectadas{str(sp.mesmo_login) ? <> (login <strong>{str(sp.mesmo_login)}</strong>)</> : null}. Para conectar
            outro e-mail, saia do supabase.com (avatar → Log out) e clique em <strong>Conectar conta Supabase</strong> de novo: a tela de login do
            Supabase vai aparecer.
          </Notice>
        )}
        {str(sp.outro_login) && (
          <Notice tone="warn" title={`Conectado com ${str(sp.outro_login)}`}>
            O e-mail informado era outro, mas o Supabase estava logado em <strong>{str(sp.outro_login)}</strong>. Se não era essa conta,
            desconecte as organizações abaixo, saia do supabase.com e conecte de novo.
          </Notice>
        )}

        {accounts.length === 0 ? (
          <EmptyState title="Nenhuma conta conectada ainda" action={connect}>
            Cole um Access Token de cada conta Supabase e todas as organizações dela entram de uma vez. Repita para cada e-mail.
          </EmptyState>
        ) : (
          groups.map((g) => {
            const projects = g.accounts.reduce((n, a) => n + a.projects.length, 0);
            // o limite grátis é do e-mail: todas as orgs Free do grupo dividem os mesmos 2 bancos ligados
            const slots = g.login ? (g.accounts.find((a) => a.freeSlots !== null)?.freeSlots ?? null) : null;
            return (
              <section key={g.login ?? "_"} aria-label={g.login ?? "Login não identificado"} className="flex flex-col gap-3">
                <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-200 text-sm font-semibold uppercase dark:bg-zinc-800">
                      {g.login?.[0] ?? "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{g.login ?? "Login não identificado"}</span>
                        {g.login && !g.verified && <Tone tone="paused">não verificado</Tone>}
                        <Tone tone={g.pat ? "ok" : "busy"}>{g.pat ? "Access Token" : "OAuth"}</Tone>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {g.accounts.length} organização(ões) · {projects} projeto(s)
                      </p>
                      {slots !== null && (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                          <FreeMeter used={2 - slots} />
                        </p>
                      )}
                    </div>
                  </div>
                  {g.pat && g.login && (
                    <div className="flex flex-wrap gap-2">
                      <CreateOrgButton login={g.login} />
                      <Link href="/contas?conectar=token" className={buttonClass("ghost", "px-2.5 py-1 text-xs")}>Atualizar token</Link>
                      <ConfirmAction
                        label="Remover login"
                        variant="ghost"
                        confirm={{
                          title: `Remover ${g.login} do Hub?`,
                          body: (
                            <>
                              Sai do Hub o token e as {g.accounts.length} organização(ões) deste login. <strong>Nada é apagado no Supabase.</strong>{" "}
                              Para invalidar o token de vez, apague-o também em supabase.com → Account → Access Tokens.
                            </>
                          ),
                          confirmLabel: "Remover login",
                          danger: true,
                        }}
                        action={removeLoginAction.bind(null, g.login)}
                      />
                    </div>
                  )}
                  {!g.login && (
                    <p className="max-w-sm text-xs text-zinc-500">
                      A organização tem vários membros, então o Hub não sabe qual login autorizou. Reconecte informando o e-mail.
                    </p>
                  )}
                </Card>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {g.accounts.map((a) => (
                    <AccountCard key={a.orgSlug} account={a} />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
