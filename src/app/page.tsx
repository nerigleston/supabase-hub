import {
  Activity,
  ArrowRight,
  Check,
  Cloud,
  Gauge,
  HeartPulse,
  KeyRound,
  Layers,
  Plug,
  RefreshCw,
  Server,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, StatusBadge } from "@/components/app-ui";
import { Logo } from "@/components/logo";
import { env } from "@/lib/env";
import { abacate } from "@/lib/abacatepay";
import { freeOrgLimit, PRICING } from "@/lib/plans";
import { getSession } from "@/lib/session";
import type { ProjectStatus } from "@/lib/supabase-api";

const REPO = "https://github.com/nerigleston/supabase-hub";

export const metadata: Metadata = {
  title: { absolute: "BaseHub · Todos os seus bancos Supabase em um só painel" },
  description:
    "Conecte várias contas Supabase, veja todos os projetos juntos, evite que bancos grátis pausem e rode SQL sem trocar de login. Na nuvem ou no seu servidor (open source).",
  openGraph: {
    title: "BaseHub · Todos os seus bancos Supabase em um só painel",
    description: "Várias contas Supabase, um painel só. Keep-alive, limite do plano grátis, SQL e tabelas. Open source.",
    type: "website",
    locale: "pt_BR",
    siteName: "BaseHub",
  },
  twitter: { card: "summary_large_image" },
};

const FEATURES = [
  {
    icon: Layers,
    title: "Todas as contas num lugar",
    body: "Conecte vários logins e organizações Supabase, por OAuth ou Access Token. Organizações novas aparecem sozinhas.",
  },
  {
    icon: HeartPulse,
    title: "Banco grátis que não pausa",
    body: "Ligue o keep-alive e o BaseHub roda um select 1 por dia no projeto. Nada de acordar com o banco pausado por inatividade.",
  },
  {
    icon: Gauge,
    title: "Limite do plano Free sob controle",
    body: "Veja quantos bancos grátis cada e-mail ainda pode ligar (2 por login) e crie o próximo onde houver vaga, automaticamente.",
  },
  {
    icon: RefreshCw,
    title: "Pausou? Um clique",
    body: "Projetos pausados aparecem em destaque e voltam ao ar com um clique, com o andamento atualizando sozinho.",
  },
  {
    icon: SquareTerminal,
    title: "SQL e tabelas sem trocar de login",
    body: "Editor SQL, navegador de tabelas e connection strings prontas para copiar, de qualquer conta conectada.",
  },
  {
    icon: Plug,
    title: "Controle pelo seu assistente (MCP)",
    body: "Conecte o BaseHub ao Claude, ChatGPT, Cursor, Claude Code ou Codex por um servidor MCP na nuvem, feito com a Jangada. Você escolhe quais ações e quais bancos ele pode tocar.",
  },
  {
    icon: Activity,
    title: "Histórico de tudo",
    body: "Log de atividade com quem criou, pausou, reativou ou rodou SQL, e alerta quando um keep-alive falha.",
  },
];

const STEPS = [
  { title: "Crie sua conta", body: "Cadastro com e-mail e senha." },
  { title: "Conecte o Supabase", body: "Autorize pelo OAuth oficial ou cole um Access Token. Repita para cada login." },
  { title: "Pronto", body: "Todos os projetos aparecem juntos. Ligue o keep-alive onde quiser." },
];

const FAQ = [
  {
    q: "Meus dados ficam seguros?",
    a: "Os tokens e senhas do Supabase são guardados criptografados (AES-256-GCM) e só são usados para falar com a API oficial do Supabase em seu nome. O código é aberto: dá para auditar tudo no GitHub.",
  },
  {
    q: "O BaseHub acessa os dados dos meus bancos?",
    a: "Só quando você pede: ao abrir uma tabela ou rodar SQL. O keep-alive executa apenas um select 1, que não lê nenhuma tabela.",
  },
  {
    q: "Funciona com o plano grátis do Supabase?",
    a: "Foi feito pensando nele: mostra o limite de 2 bancos ativos por e-mail, evita a pausa por inatividade e reativa projetos pausados.",
  },
  {
    q: "Posso rodar no meu próprio servidor?",
    a: "Pode. O BaseHub é open source (AGPL-3.0). O README do repositório tem o passo a passo para subir com a sua própria AWS e Vercel ou qualquer host Node.js.",
  },
  {
    q: "Como funciona o MCP?",
    a: "No plano Business, você adiciona o servidor MCP (app.mcp.jangada.dev.br) no seu assistente. O login é pelo próprio BaseHub (OAuth), e só as ações e bancos que você liberar na tela de MCP podem ser usados. O servidor foi construído com a Jangada.",
  },
  {
    q: "É um produto oficial do Supabase?",
    a: "Não. O BaseHub é um projeto independente que usa a Management API pública do Supabase.",
  },
];

const PREVIEW: { name: string; org: string; status: ProjectStatus; keep: boolean }[] = [
  { name: "loja-producao", org: "cliente-acme", status: "ACTIVE_HEALTHY", keep: true },
  { name: "app-agenda", org: "pessoal", status: "ACTIVE_HEALTHY", keep: true },
  { name: "crm-teste", org: "freela-2025", status: "INACTIVE", keep: false },
  { name: "blog", org: "pessoal", status: "RESTORING", keep: false },
];

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl shadow-emerald-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/40">
      <div className="flex items-center gap-1.5 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="size-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        <span className="ml-3 text-xs text-zinc-500">Visão geral</span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        {[
          ["Logins", "3"],
          ["Projetos", "9"],
          ["Grátis livres", "2"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <p className="text-[11px] text-zinc-500">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-y border-zinc-200 dark:border-zinc-800">
            <th className="px-4 py-2 font-medium">Projeto</th>
            <th className="hidden px-4 py-2 font-medium sm:table-cell">Conta</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 text-right font-medium">Manter ativo</th>
          </tr>
        </thead>
        <tbody>
          {PREVIEW.map((p) => (
            <tr key={p.name} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
              <td className="px-4 py-2.5 font-medium">{p.name}</td>
              <td className="hidden px-4 py-2.5 text-zinc-500 sm:table-cell">{p.org}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-4 py-2.5 text-right">
                <span
                  aria-label={p.keep ? "Ligado" : "Desligado"}
                  className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 ${p.keep ? "justify-end bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
                >
                  <span className="size-4 rounded-full bg-white" />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function LandingPage() {
  const session = await getSession();
  const signupOpen = env.signupOpen;
  const primary = session
    ? { href: "/painel", label: "Abrir o painel" }
    : signupOpen
      ? { href: "/cadastro", label: "Criar conta" }
      : env.accessRequestUrl
        ? { href: env.accessRequestUrl, label: "Quero ser avisado" }
        : { href: "/cadastro", label: "Pedir acesso" };
  const orgLimit = freeOrgLimit();
  const upgrade = env.upgradeUrl;
  const payments = abacate.configured;
  const brl = (n: number) => n.toLocaleString("pt-BR");
  const { currency, monthly, yearly } = PRICING.pro;
  const faq =
    orgLimit === null
      ? FAQ
      : [
          {
            q: "Quanto custa?",
            a: `O plano Grátis conecta até ${orgLimit} organizações Supabase, com todos os recursos. O Pro libera organizações ilimitadas por ${currency} ${brl(monthly)}/mês ou ${currency} ${brl(yearly)}/ano${payments ? "" : " e chega em breve; quem estiver no Grátis migra quando quiser"}.`,
          },
          ...FAQ,
        ];
  const steps = signupOpen
    ? STEPS
    : [{ title: "Peça seu acesso", body: "Estamos liberando contas aos poucos. Deixe seu contato e avisamos quando abrir." }, ...STEPS.slice(1)];

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/" aria-label="BaseHub, início">
            <Logo />
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-6 text-sm text-zinc-600 md:flex dark:text-zinc-400">
            <a href="#recursos" className="hover:text-zinc-900 dark:hover:text-white">Recursos</a>
            <a href="#como-funciona" className="hover:text-zinc-900 dark:hover:text-white">Como funciona</a>
            <a href="#mcp" className="hover:text-zinc-900 dark:hover:text-white">MCP</a>
            {orgLimit !== null && <a href="#precos" className="hover:text-zinc-900 dark:hover:text-white">Preços</a>}
            <a href="#open-source" className="hover:text-zinc-900 dark:hover:text-white">Open source</a>
            <a href="#faq" className="hover:text-zinc-900 dark:hover:text-white">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={REPO} aria-label="Código no GitHub" className="hidden rounded-md p-2 text-zinc-600 hover:bg-zinc-100 sm:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-800">
              <GithubIcon className="size-5" />
            </a>
            {!session && (
              <Link href="/login" className={buttonClass("secondary")}>Entrar</Link>
            )}
            <Link href={primary.href} className={buttonClass("primary")}>{session ? "Painel" : signupOpen ? "Começar" : "Pedir acesso"}</Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-600/20" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 md:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <div>
              <a
                href={REPO}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs text-zinc-600 hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-400"
              >
                <GithubIcon className="size-3.5" /> Open source · AGPL-3.0
              </a>
              <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
                Todos os seus bancos Supabase em <span className="text-emerald-600 dark:text-emerald-400">um só painel</span>.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-pretty text-zinc-600 dark:text-zinc-400">
                Vários logins, várias organizações, um lugar só. Veja o estado de cada projeto, evite que bancos grátis pausem e rode SQL sem
                ficar saindo e entrando de conta.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={primary.href} className={buttonClass("primary", "h-11 px-5 text-base")}>
                  {primary.label} <ArrowRight className="size-4" />
                </Link>
                <a href={REPO} className={buttonClass("secondary", "h-11 px-5 text-base")}>
                  <GithubIcon className="size-4" /> Ver no GitHub
                </a>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
                {["Open source", "OAuth oficial do Supabase", "Tokens criptografados"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="size-4 text-emerald-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="scroll-mt-20 border-t border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">Feito para quem tem Supabase espalhado em várias contas</h2>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                Freelancers, agências e quem usa o plano grátis em vários projetos: chega de abrir aba anônima para lembrar qual banco está em
                qual e-mail.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Em 2 minutos está rodando</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="relative rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <span className="grid size-8 place-items-center rounded-full bg-emerald-600 text-sm font-semibold text-white">{i + 1}</span>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex items-start gap-2 text-sm text-zinc-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              Tokens e senhas guardados com AES-256-GCM, sessão em cookie httpOnly e CSP estrita. Você pode desconectar uma conta a qualquer momento.
            </p>
          </div>
        </section>

        {/* MCP (Business) */}
        <section id="mcp" className="scroll-mt-20 border-t border-zinc-800 bg-zinc-950 py-20 text-zinc-100">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-medium text-emerald-300">
                  <Plug className="size-3.5" /> Plano Business
                </span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">Seus bancos, controlados pelo seu assistente</h2>
                <p className="mt-3 text-zinc-400">
                  Adicione o servidor MCP na nuvem no Claude, ChatGPT, Cursor, Claude Code ou Codex e peça em linguagem natural: &quot;liste os bancos
                  pausados&quot;, &quot;rode esse SQL no projeto X&quot;, &quot;reative o banco do cliente&quot;. Você decide, na sua tela,
                  quais ações e quais bancos ele pode tocar, e o login é o seu BaseHub (OAuth).
                </p>
                <ul className="mt-6 flex flex-col gap-2 text-sm text-zinc-300">
                  <li>• Login seguro via OAuth do BaseHub</li>
                  <li>• Liga/desliga cada ação e limita os bancos</li>
                  <li>• Ações sensíveis (excluir banco) ficam destacadas</li>
                </ul>
                <p className="mt-6 text-sm text-zinc-500">
                  Servidor MCP feito com a{" "}
                  <a href="https://jangada.dev.br" target="_blank" rel="noreferrer" className="font-medium text-emerald-400 hover:underline">Jangada</a>.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-5 font-mono text-xs text-zinc-300">
                <p className="text-zinc-500"># no Claude: Conectores, Adicionar</p>
                <p className="mt-2 break-all text-emerald-300">{env.mcpUrl}</p>
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-zinc-500"># exemplos</p>
                  <p className="mt-2">&rarr; liste meus bancos pausados</p>
                  <p>&rarr; rode &quot;select count(*) from users&quot; no app-agenda</p>
                  <p>&rarr; reative o banco crm-teste</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Preços (só quando o servidor tem planos: FREE_ORG_LIMIT) */}
        {orgLimit !== null && (
          <section id="precos" className="scroll-mt-20 border-t border-zinc-200 py-20 dark:border-zinc-800">
            <div className="mx-auto max-w-6xl px-4 md:px-6">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-semibold tracking-tight">Preços simples</h2>
                <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                  Comece de graça. O Pro libera organizações ilimitadas, e o Business adiciona o MCP na nuvem.
                </p>
              </div>
              <div className="mt-10 grid gap-4 md:grid-cols-3">
                <div className="flex flex-col rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <h3 className="font-semibold">Grátis</h3>
                  <p className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight">R$ 0</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">para sempre</p>
                  <ul className="mt-6 flex flex-col gap-2 text-sm">
                    {[`Até ${orgLimit} organizações Supabase`, "Keep-alive diário", "Editor SQL e tabelas", "Histórico de atividade"].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <Check className="size-4 text-zinc-400" /> {t}
                      </li>
                    ))}
                  </ul>
                  <Link href={primary.href} className={buttonClass("secondary", "mt-8 h-10 self-start px-4")}>{primary.label}</Link>
                </div>
                <div className="flex flex-col rounded-xl border-2 border-emerald-600 p-6">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Pro</h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {payments ? "Ilimitado" : "Em breve"}
                    </span>
                  </div>
                  <p className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight">{PRICING.pro.currency} {brl(PRICING.pro.monthly)}</span>
                    <span className="text-zinc-500">/mês</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    ou {PRICING.pro.currency} {brl(PRICING.pro.yearly)}/ano (2 meses grátis)
                  </p>
                  <ul className="mt-6 flex flex-col gap-2 text-sm">
                    {["Organizações ilimitadas", "Tudo do plano Grátis", "Vários logins Supabase", "Suporte por e-mail"].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-600" /> {t}
                      </li>
                    ))}
                  </ul>
                  {payments ? (
                    <a href={session ? (upgrade ?? "/painel") : primary.href} className={buttonClass("primary", "mt-8 h-10 self-start px-4")}>
                      {session ? "Assinar o Pro" : primary.label}
                    </a>
                  ) : (
                    <p className="mt-8 text-sm text-zinc-500">Pagamento abre em breve. Comece no Grátis e migre quando quiser.</p>
                  )}
                </div>
                <div className="flex flex-col rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Business</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">
                      <Plug className="size-3" /> MCP
                    </span>
                  </div>
                  <p className="mt-4">
                    <span className="text-4xl font-semibold tracking-tight">{PRICING.business.currency} {brl(PRICING.business.monthly)}</span>
                    <span className="text-zinc-500">/mês</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">ou {PRICING.business.currency} {brl(PRICING.business.yearly)}/ano</p>
                  <ul className="mt-6 flex flex-col gap-2 text-sm">
                    {["Tudo do plano Pro", "MCP na nuvem (Claude, ChatGPT, Cursor, Codex)", "Ligar/desligar ações do MCP", "Suporte prioritário"].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-600" /> {t}
                      </li>
                    ))}
                  </ul>
                  {payments ? (
                    <a href={session ? "/assinar" : primary.href} className={buttonClass("secondary", "mt-8 h-10 self-start px-4")}>
                      {session ? "Assinar o Business" : primary.label}
                    </a>
                  ) : (
                    <p className="mt-8 text-sm text-zinc-500">Pagamento abre em breve.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Nuvem x self-hosted */}
        <section id="open-source" className="scroll-mt-20 border-y border-zinc-200 bg-zinc-50 py-20 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">Use na nuvem ou rode no seu servidor</h2>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">O código é o mesmo. Você escolhe quem cuida da infraestrutura.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <div className="flex flex-col rounded-xl border-2 border-emerald-600 bg-white p-6 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <Cloud className="size-5 text-emerald-600" />
                  <h3 className="font-semibold">BaseHub na nuvem</h3>
                  <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Recomendado
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Sem servidor para manter. A gente cuida do resto.</p>
                <ul className="mt-5 flex flex-col gap-2 text-sm">
                  {["Nada para instalar", "Grátis até 2 organizações; Pro ilimitado", "Keep-alive diário já funcionando", "Infra, backup e atualizações por nossa conta"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" /> {t}
                    </li>
                  ))}
                </ul>
                <Link href={primary.href} className={buttonClass("primary", "mt-6 h-10 self-start px-4")}>
                  {primary.label} <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                  <Server className="size-5 text-zinc-500" />
                  <h3 className="font-semibold">Self-hosted</h3>
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Clone o repositório e suba na sua infraestrutura.</p>
                <ul className="mt-5 flex flex-col gap-2 text-sm">
                  {["Código aberto (AGPL-3.0)", "Organizações ilimitadas", "Seus dados na sua conta AWS", "Você cuida de deploy, cron e updates"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="size-4 text-zinc-400" /> {t}
                    </li>
                  ))}
                </ul>
                <a href={`${REPO}#self-hosting`} className={buttonClass("secondary", "mt-6 h-10 self-start px-4")}>
                  <GithubIcon className="size-4" /> Guia de instalação
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <h2 className="text-3xl font-semibold tracking-tight">Dúvidas frequentes</h2>
            <div className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {faq.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="px-4 pb-20 md:px-6">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-zinc-950 px-6 py-14 ring-1 ring-zinc-800 text-center text-white md:px-12">
            <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-emerald-600/30 blur-3xl" />
            <KeyRound className="relative mx-auto size-8 text-emerald-400" />
            <h2 className="relative mt-4 text-3xl font-semibold tracking-tight">Organize seus bancos Supabase hoje</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-zinc-400">Conecte a primeira conta em menos de um minuto.</p>
            <Link href={primary.href} className={buttonClass("primary", "relative mt-8 h-11 px-6 text-base")}>
              {primary.label} <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span>© {new Date().getFullYear()}</span>
          </div>
          <p className="max-w-md text-xs">
            Projeto independente, não afiliado à Supabase Inc. &quot;Supabase&quot; é marca registrada da Supabase Inc.
          </p>
          <div className="flex gap-4">
            <a href={REPO} className="hover:text-zinc-900 dark:hover:text-white">GitHub</a>
            <Link href="/login" className="hover:text-zinc-900 dark:hover:text-white">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
