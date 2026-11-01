"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { disconnectAction, renameConnectionAction } from "@/app/actions";
import type { AccountView } from "@/lib/hub";
import { ConfirmAction, Spinner } from "./confirm-action";
import { toast } from "./toast";
import { buttonClass, Card, inputClass, Tone } from "./app-ui";

export function AccountCard({ account }: { account: AccountView }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(account.name);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await renameConnectionAction(account.orgSlug, label);
      toast(r.ok, r.message);
      if (r.ok) setEditing(false);
    });

  const plan = account.plan ? account.plan[0].toUpperCase() + account.plan.slice(1) : "Plano ?";

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="flex flex-col gap-1.5"
            >
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setLabel(account.name))}
                  placeholder={account.supabaseName}
                  aria-label="Apelido da organização no BaseHub"
                  className={inputClass}
                />
                <button disabled={pending} className={buttonClass("primary")}>{pending ? <Spinner /> : "Salvar"}</button>
              </div>
              <p className="text-xs text-zinc-500">
                Apelido só no BaseHub (vazio volta ao nome do Supabase). O Supabase não deixa renomear pela API:{" "}
                <a
                  href={`https://supabase.com/dashboard/org/${account.orgSlug}/general`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  renomear no Supabase ↗
                </a>
                . O BaseHub pega o nome novo sozinho em algumas horas.
              </p>
            </form>
          ) : (
            <button onClick={() => setEditing(true)} className="group text-left" title="Clique para dar um apelido">
              <h3 className="truncate font-semibold group-hover:underline">{account.name}</h3>
            </button>
          )}
          {!editing && account.name !== account.supabaseName && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">No Supabase: {account.supabaseName}</p>
          )}
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{account.orgSlug}</p>
        </div>
        {account.error ? (
          <Tone tone="error">{account.status === "reauth" ? "Reconectar" : "Erro"}</Tone>
        ) : (
          <Tone tone="ok">Conectada</Tone>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-zinc-500">Plano</dt>
          <dd className="font-medium">{plan}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Projetos</dt>
          <dd className="font-medium tabular-nums">{account.projects.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Ligados</dt>
          <dd className="font-medium tabular-nums">{account.activeCount}</dd>
        </div>
      </dl>

      {account.error && <p className="text-sm text-rose-700 dark:text-rose-300">{account.error}</p>}
      {!account.error && account.blockedBy?.length ? (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Sem vaga para banco grátis: {account.blockedBy.join(", ")} já {account.blockedBy.length > 1 ? "têm" : "tem"} 2 ligados (somando as organizações
          em que {account.blockedBy.length > 1 ? "são donos ou admins" : "é dono ou admin"}).
        </p>
      ) : null}

      <Link
        href={`/contas/${account.orgSlug}`}
        className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
      >
        Ver bancos ({account.projects.length})
        <ChevronRight aria-hidden className="size-4 text-zinc-400" />
      </Link>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        {account.status === "reauth" && (
          <a
            href={account.authKind === "pat" ? "/contas?conectar=token" : `/api/supabase/connect${account.login ? `?login=${encodeURIComponent(account.login)}` : ""}`}
            className={buttonClass("primary", "px-2.5 py-1 text-xs")}
          >
            {account.authKind === "pat" ? "Colar token novo" : "Reconectar"}
          </a>
        )}
        <button onClick={() => setEditing(true)} className={buttonClass("ghost", "px-2.5 py-1 text-xs")}>Apelido</button>
        <ConfirmAction
          label="Desconectar"
          variant="ghost"
          confirm={{
            title: `Desconectar "${account.name}"?`,
            body: (
              <>
                O painel apaga o acesso salvo desta conta e deixa de mostrar os projetos dela.
                <strong> Nada é apagado no Supabase.</strong> Você pode reconectar quando quiser.
              </>
            ),
            confirmLabel: "Desconectar",
            danger: true,
          }}
          action={() => disconnectAction(account.orgSlug)}
        />
        <a
          href={`https://supabase.com/dashboard/org/${account.orgSlug}`}
          target="_blank"
          rel="noreferrer"
          className={buttonClass("ghost", "ml-auto px-2.5 py-1 text-xs")}
        >
          Abrir no Supabase ↗
        </a>
      </div>
    </Card>
  );
}
