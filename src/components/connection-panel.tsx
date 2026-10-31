"use client";

import { useState, useTransition } from "react";
import { revealApiKeysAction, revealPasswordAction, resetPasswordAction, saveKnownPasswordAction } from "@/app/actions";
import { ConfirmAction, Spinner } from "./confirm-action";
import { CopyField } from "./copy-field";
import { toast } from "./toast";
import { buttonClass, Card, inputClass, Tone } from "./app-ui";

export type ConnString = { label: string; hint: string; template: string };

const PLACEHOLDER = "[YOUR-PASSWORD]";
const SOURCE: Record<string, string> = { created: "criada pelo painel", reset: "redefinida pelo painel", manual: "informada e verificada" };
const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function ConnectionPanel({
  org,
  projectRef,
  apiUrl,
  strings,
  passwordInfo,
  online,
}: {
  org: string;
  projectRef: string;
  apiUrl: string;
  strings: ConnString[];
  passwordInfo: { source: string; updatedAt: string } | null;
  online: boolean;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [info, setInfo] = useState(passwordInfo);
  const [keys, setKeys] = useState<{ name: string; type: string; key: string }[] | null>(null);
  const [manual, setManual] = useState("");
  const [custom, setCustom] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [pending, start] = useTransition();
  const [pendingKeys, startKeys] = useTransition();

  const reveal = () =>
    start(async () => {
      const r = await revealPasswordAction(projectRef);
      if (!r.ok) return toast(false, r.message);
      setPassword(r.data?.password ?? null);
    });

  const saveManual = () =>
    start(async () => {
      const r = await saveKnownPasswordAction(org, projectRef, manual);
      toast(r.ok, r.message);
      if (r.ok) {
        setPassword(manual.trim());
        setInfo({ source: "manual", updatedAt: new Date().toISOString() });
        setManual("");
        setShowManual(false);
      }
    });

  const loadKeys = () =>
    startKeys(async () => {
      const r = await revealApiKeysAction(org, projectRef);
      if (!r.ok) return toast(false, r.message);
      setKeys(r.data ?? []);
    });

  const fill = (template: string) => (password ? template.replace(PLACEHOLDER, encodeURIComponent(password)) : template);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="flex flex-col gap-4 p-5 xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Connection strings</h2>
            <p className="text-sm text-zinc-500">
              {password ? "Já com a senha preenchida." : `Com ${PLACEHOLDER} no lugar da senha.`}{" "}
              Use o pooler (transaction) em serverless e o session/direto em servidores.
            </p>
          </div>
          {!password && info && (
            <button onClick={reveal} disabled={pending} className={buttonClass("secondary")}>
              {pending && <Spinner />} Preencher com a senha
            </button>
          )}
        </div>
        {strings.length ? (
          strings.map((s) => <CopyField key={s.label} label={s.label} hint={s.hint} value={fill(s.template)} secret={Boolean(password)} />)
        ) : (
          <p className="text-sm text-zinc-500">{online ? "Não foi possível ler a configuração do pooler." : "Reative o projeto para ver as connection strings."}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Senha do banco</h2>
          {info ? <Tone tone="ok">Conhecida</Tone> : <Tone tone="paused">Desconhecida</Tone>}
        </div>

        {info ? (
          <p className="text-sm text-zinc-500">
            Senha {SOURCE[info.source] ?? info.source} em {fmt.format(new Date(info.updatedAt))}.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            O Supabase não informa a senha atual. Se você sabe a senha, informe-a para o painel guardar. Se não sabe, redefina.
          </p>
        )}

        {password && <CopyField label="Senha" value={password} secret />}

        <div className="flex flex-wrap gap-2">
          {info && !password && (
            <button onClick={reveal} disabled={pending} className={buttonClass("secondary")}>
              {pending && <Spinner />} Mostrar senha
            </button>
          )}
          <button onClick={() => setShowManual((v) => !v)} className={buttonClass("ghost")} aria-expanded={showManual}>
            {info ? "Informar outra senha" : "Informar senha atual"}
          </button>
        </div>

        {showManual && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveManual();
            }}
            className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <label className="text-sm">
              Senha atual do banco
              <input value={manual} onChange={(e) => setManual(e.target.value)} type="password" autoComplete="off" className={`${inputClass} mt-1 font-mono`} />
            </label>
            <p className="text-xs text-zinc-500">O painel testa a conexão com essa senha antes de guardar. Nada muda no Supabase.</p>
            <div className="flex gap-2">
              <button disabled={pending || !manual} className={buttonClass("primary")}>{pending && <Spinner />} Testar e guardar</button>
              <button type="button" onClick={() => setShowManual(false)} className={buttonClass("secondary")}>Cancelar</button>
            </div>
          </form>
        )}

        <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h3 className="mb-1 text-sm font-medium">Redefinir senha</h3>
          <p className="mb-2 text-xs text-zinc-500">Deixe vazio para gerar uma senha forte de 24 caracteres.</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Nova senha (opcional, mín. 12)"
              autoComplete="off"
              className={`${inputClass} flex-1 font-mono`}
            />
            <ConfirmAction
              label="Redefinir"
              variant="danger"
              size="md"
              pendingLabel="Redefinindo…"
              confirm={{
                title: "Redefinir a senha do banco?",
                body: (
                  <>
                    <strong>Toda aplicação que usa a senha atual vai parar de conectar</strong> até você atualizar a connection string nela.
                    A nova senha aparece aqui logo em seguida.
                  </>
                ),
                confirmLabel: "Redefinir senha",
                danger: true,
              }}
              action={() => resetPasswordAction(org, projectRef, custom)}
              onDone={(r) => {
                const data = r.data as { password: string } | undefined;
                if (r.ok && data) {
                  setPassword(data.password);
                  setInfo({ source: "reset", updatedAt: new Date().toISOString() });
                  setCustom("");
                }
              }}
            />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="font-semibold">API</h2>
        <CopyField label="URL do projeto" value={apiUrl} />
        {keys ? (
          keys.length ? (
            keys.map((k) => (
              <CopyField
                key={k.name + k.type}
                label={k.name}
                hint={k.type === "secret" || k.name === "service_role" ? "Secreta: só no servidor" : "Pública"}
                value={k.key}
                secret
              />
            ))
          ) : (
            <p className="text-sm text-zinc-500">Nenhuma chave retornada.</p>
          )
        ) : (
          <div>
            <button onClick={loadKeys} disabled={pendingKeys || !online} className={buttonClass("secondary")}>
              {pendingKeys && <Spinner />} Mostrar chaves de API
            </button>
            <p className="mt-2 text-xs text-zinc-500">anon/publishable e service_role/secret. Ver as chaves fica registrado em Atividade.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
