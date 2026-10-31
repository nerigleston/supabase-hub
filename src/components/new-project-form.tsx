"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type ActionResult, type CreatedProject, createProjectAction } from "@/app/actions";
import { REGIONS } from "@/lib/status";
import { Spinner } from "./confirm-action";
import { CopyField } from "./copy-field";
import { buttonClass, Card, inputClass, Notice } from "./app-ui";

type AccountOption = { slug: string; name: string; login?: string; freeSlots: number | null; ok: boolean };

export function NewProjectForm({ accounts }: { accounts: AccountOption[] }) {
  const [state, formAction, pending] = useActionState<ActionResult<CreatedProject> | null, FormData>(createProjectAction, null);
  const [org, setOrg] = useState("auto");

  const usable = accounts.filter((a) => a.ok && (a.freeSlots === null || a.freeSlots > 0));
  const auto = usable[0];
  const selected = accounts.find((a) => a.slug === org);
  const selectedFull = selected && selected.freeSlots === 0;

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
            <Link href="/" className={buttonClass("secondary")}>Voltar à visão geral</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {state && !state.ok && <Notice tone="error" title="Não foi possível criar">{state.message}</Notice>}

      <Card className="flex flex-col gap-5 p-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Nome do projeto</span>
          <input name="name" required minLength={3} maxLength={64} placeholder="ex.: cliente-acme-prod" className={inputClass} />
          <span className="text-xs text-zinc-500">Use o nome do cliente para achar fácil depois.</span>
        </label>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">Conta</legend>
          <label className="flex items-start gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <input type="radio" name="org" value="auto" checked={org === "auto"} onChange={() => setOrg("auto")} className="mt-1" />
            <span>
              <span className="font-medium">Escolher automaticamente</span>
              <span className="block text-xs text-zinc-500">
                {auto
                  ? `Vai para "${auto.name}"${auto.login ? ` (${auto.login})` : ""}: ${auto.freeSlots === null ? "plano pago" : `${auto.freeSlots} banco(s) grátis livre(s)`}.`
                  : "Todos os e-mails já estão com 2 bancos grátis ligados."}
              </span>
            </span>
          </label>
          {accounts.map((a) => (
            <label key={a.slug} className={`flex items-start gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800 ${!a.ok ? "opacity-50" : ""}`}>
              <input type="radio" name="org" value={a.slug} disabled={!a.ok} checked={org === a.slug} onChange={() => setOrg(a.slug)} className="mt-1" />
              <span>
                <span className="font-medium">{a.name}</span>
                <span className="block text-xs text-zinc-500">
                  {!a.ok
                    ? "Conta com erro: reconecte em Contas"
                    : a.freeSlots === null
                      ? "Plano pago: sem limite de bancos grátis"
                      : `${a.login ?? "E-mail não identificado"} · ${2 - a.freeSlots} de 2 bancos grátis ligados${a.freeSlots ? "" : " (limite atingido)"}`}
                </span>
              </span>
            </label>
          ))}
          {selectedFull && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              O e-mail desta organização já tem 2 bancos grátis ligados. O Supabase vai recusar, a menos que você pause um banco desse e-mail antes.
            </p>
          )}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Região</span>
          <select name="region" defaultValue="sa-east-1" className={inputClass}>
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">Escolha a mais próxima dos usuários. Não dá para mudar depois.</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Senha do banco <span className="font-normal text-zinc-500">(opcional)</span></span>
          <input name="password" type="text" minLength={12} autoComplete="off" placeholder="Deixe vazio para gerar uma senha forte" className={`${inputClass} font-mono`} />
        </label>
      </Card>

      <div className="flex gap-2">
        <button disabled={pending || (org === "auto" && !auto)} className={buttonClass("primary", "py-2")}>
          {pending && <Spinner />}
          {pending ? "Criando projeto…" : "Criar projeto"}
        </button>
        <Link href="/" className={buttonClass("secondary", "py-2")}>Cancelar</Link>
      </div>
    </form>
  );
}
