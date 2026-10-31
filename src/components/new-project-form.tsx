"use client";

import { Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { type ActionResult, type CreatedProject, createProjectAction } from "@/app/actions";
import { REGIONS } from "@/lib/status";
import { Spinner } from "./confirm-action";
import { CopyField } from "./copy-field";
import { buttonClass, Card, inputClass, Notice } from "./app-ui";

type AccountOption = { slug: string; name: string; login?: string; freeSlots: number | null; ok: boolean };

/** 0 = com vaga, 1 = plano pago, 2 = cheio, 3 = com erro (ordem) */
const rank = (a: AccountOption) => (!a.ok ? 3 : a.freeSlots === null ? 1 : a.freeSlots > 0 ? 0 : 2);

const pill = "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium";
const TONE = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  full: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paid: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  err: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/** Grupo = e-mail do Supabase (o limite de 2 bancos grátis ligados é do e-mail). */
type Group = { key: string; login?: string; items: AccountOption[]; freeSlots: number | null };

function groupByLogin(list: AccountOption[]): Group[] {
  const map = new Map<string, Group>();
  for (const a of list) {
    const key = a.login ?? `org:${a.slug}`;
    const g = map.get(key) ?? { key, login: a.login, items: [], freeSlots: null };
    g.items.push(a);
    // vagas do e-mail: vêm iguais em todas as orgs grátis dele
    if (a.ok && a.freeSlots !== null) g.freeSlots = a.freeSlots;
    map.set(key, g);
  }
  const grank = (g: Group) => Math.min(...g.items.map(rank));
  return [...map.values()].sort((a, b) => grank(a) - grank(b) || (a.login ?? "~").localeCompare(b.login ?? "~"));
}

function GroupBadge({ g }: { g: Group }) {
  if (g.freeSlots === null) {
    const anyOk = g.items.some((a) => a.ok);
    return <span className={`${pill} ${anyOk ? TONE.paid : TONE.err}`}>{anyOk ? "Plano pago" : "Com erro"}</span>;
  }
  return g.freeSlots > 0 ? (
    <span className={`${pill} ${TONE.ok}`}>
      {g.freeSlots} vaga{g.freeSlots > 1 ? "s" : ""} no e-mail
    </span>
  ) : (
    <span className={`${pill} ${TONE.full}`}>E-mail cheio</span>
  );
}

const cardBase = "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500/40";
const cardOn = "border-emerald-500 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-950/30";
const cardOff = "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40";

export function NewProjectForm({ accounts, defaultOrg }: { accounts: AccountOption[]; defaultOrg?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult<CreatedProject> | null, FormData>(createProjectAction, null);
  const [org, setOrg] = useState(defaultOrg && accounts.some((a) => a.slug === defaultOrg && a.ok) ? defaultOrg : "auto");
  const [query, setQuery] = useState("");

  const usable = accounts.filter((a) => a.ok && (a.freeSlots === null || a.freeSlots > 0));
  const auto = usable[0];
  const selected = accounts.find((a) => a.slug === org);
  const selectedFull = selected && selected.freeSlots === 0;
  const target = org === "auto" ? auto : selected;

  const q = query.trim().toLowerCase();
  const groups = groupByLogin(
    accounts
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.login ?? "").toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)),
  );
  const emailsWithSlot = groupByLogin(accounts).filter((g) => g.freeSlots === null ? g.items.some((a) => a.ok) : g.freeSlots > 0).length;

  if (state?.ok && state.data) {
    const d = state.data;
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Notice tone="ok" title={state.message} />
        <Card className="flex flex-col gap-4 p-5">
          <p className="text-sm">
            <strong>Guarde a senha agora.</strong> Ela também fica salva (criptografada) no painel, na aba Conexão do projeto.
          </p>
          <CopyField label="Senha do banco" value={d.password} secret />
          <CopyField label="Ref do projeto" value={d.ref} />
          <div className="flex gap-2">
            <Link href={`/p/${d.orgSlug}/${d.ref}`} className={buttonClass("primary")}>Abrir projeto</Link>
            <Link href="/painel" className={buttonClass("secondary")}>Voltar à visão geral</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state && !state.ok && <Notice tone="error" title="Não foi possível criar">{state.message}</Notice>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Detalhes: à direita e fixo no desktop; primeiro no celular */}
        <Card className="flex flex-col gap-5 p-5 lg:sticky lg:top-6 lg:order-2">
          <h2 className="font-semibold">Detalhes</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Nome do projeto</span>
            <input name="name" required minLength={3} maxLength={64} placeholder="ex.: cliente-acme-prod" className={inputClass} />
            <span className="text-xs text-zinc-500">Use o nome do cliente para achar fácil depois.</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Região</span>
            <select name="region" defaultValue="sa-east-1" className={inputClass}>
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">A mais próxima dos usuários. Não dá para mudar depois.</span>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Senha do banco <span className="font-normal text-zinc-500">(opcional)</span>
            </span>
            <input name="password" type="text" minLength={12} autoComplete="off" placeholder="Vazio gera uma senha forte" className={`${inputClass} font-mono`} />
          </label>

          <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Vai criar em: </span>
            {target ? (
              <>
                {target.name}
                {target.login ? ` (${target.login})` : ""}
                {org === "auto" ? ", escolhida automaticamente" : ""}
              </>
            ) : (
              "nenhuma conta com vaga"
            )}
            {selectedFull && (
              <p className="mt-1.5 text-amber-700 dark:text-amber-300">
                Este e-mail já tem 2 bancos grátis ligados. O Supabase vai recusar, a menos que você pause um banco dele antes.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button disabled={pending || (org === "auto" && !auto)} className={buttonClass("primary", "flex-1 justify-center py-2")}>
              {pending && <Spinner />}
              {pending ? "Criando projeto…" : "Criar projeto"}
            </button>
            <Link href="/painel" className={buttonClass("secondary", "py-2")}>Cancelar</Link>
          </div>
        </Card>

        {/* Onde criar */}
        <Card className="flex flex-col gap-4 p-5 lg:order-1">
          <fieldset className="flex flex-col gap-4 text-sm">
            <legend className="mb-1 font-semibold">Onde criar</legend>

            <label className={`${cardBase} ${org === "auto" ? cardOn : cardOff}`}>
              <input type="radio" name="org" value="auto" checked={org === "auto"} onChange={() => setOrg("auto")} className="mt-1 accent-emerald-600" />
              <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span className="min-w-0">
                <span className="font-medium">Escolher automaticamente</span>
                <span className="block text-xs text-zinc-500">
                  {auto
                    ? `Usa uma conta com vaga. Agora: "${auto.name}"${auto.login ? ` (${auto.login})` : ""}.`
                    : "Todos os e-mails já estão com 2 bancos grátis ligados."}
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-500">
                Ou escolha a organização · {emailsWithSlot} e-mail(s) com vaga. O limite de 2 bancos grátis ligados é por e-mail, somando as orgs dele.
              </span>
              <label className="relative w-full sm:w-64">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar conta ou e-mail"
                  aria-label="Buscar conta"
                  className={`${inputClass} pl-8`}
                />
              </label>
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma conta encontrada.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((g) => (
                  <div key={g.key} className="flex flex-col gap-2 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0 xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-start xl:gap-1 xl:pt-1">
                      <span className="max-w-full truncate text-sm font-medium" title={g.login}>{g.login ?? "E-mail não identificado"}</span>
                      <span className="flex items-center gap-2">
                        <GroupBadge g={g} />
                        {g.freeSlots !== null && <span className="text-xs text-zinc-500">{2 - g.freeSlots} de 2 ligados</span>}
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {g.items.map((a) => (
                        <label key={a.slug} className={`${cardBase} ${org === a.slug ? cardOn : cardOff} ${!a.ok ? "cursor-not-allowed opacity-50" : ""}`}>
                          <input
                            type="radio"
                            name="org"
                            value={a.slug}
                            disabled={!a.ok}
                            checked={org === a.slug}
                            onChange={() => setOrg(a.slug)}
                            className="mt-1 accent-emerald-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{a.name}</span>
                            <span className="block truncate text-xs text-zinc-500">
                              {!a.ok ? "Com erro: reconecte em Contas" : a.freeSlots === null ? "Org paga, sem limite" : "Org grátis, usa a vaga do e-mail"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        </Card>
      </div>
    </form>
  );
}
