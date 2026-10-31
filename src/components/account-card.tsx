"use client";

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
              className="flex gap-2"
            >
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setLabel(account.name))}
                aria-label="Nome da conta"
                className={inputClass}
              />
              <button disabled={pending} className={buttonClass("primary")}>{pending ? <Spinner /> : "Salvar"}</button>
            </form>
          ) : (
            <button onClick={() => setEditing(true)} className="group text-left" title="Clique para renomear">
              <h3 className="truncate font-semibold group-hover:underline">{account.name}</h3>
            </button>
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

      <div className="mt-auto flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        {account.status === "reauth" && (
          <a
            href={account.authKind === "pat" ? "/contas?conectar=token" : `/api/supabase/connect${account.login ? `?login=${encodeURIComponent(account.login)}` : ""}`}
            className={buttonClass("primary", "px-2.5 py-1 text-xs")}
          >
            {account.authKind === "pat" ? "Colar token novo" : "Reconectar"}
          </a>
        )}
        <button onClick={() => setEditing(true)} className={buttonClass("ghost", "px-2.5 py-1 text-xs")}>Renomear</button>
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
