"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { type ActionResult, connectPatAction } from "@/app/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "./confirm-action";
import { buttonClass, inputClass, Notice } from "./app-ui";

type Mode = "token" | "oauth";
type PatResult = ActionResult<{ email: string; added: string[]; total: number }>;

/**
 * Conectar contas Supabase (o diferencial do Hub: vários logins num lugar só).
 * - Access Token: puxa todas as organizações do login de uma vez (recomendado).
 * - OAuth: uma organização por autorização, com escopo mínimo.
 */
export function ConnectDialog({
  disabled,
  knownLogins,
  autoOpen,
}: {
  disabled?: boolean;
  knownLogins: string[];
  autoOpen?: Mode;
}) {
  const [open, setOpen] = useState(Boolean(autoOpen));
  const [mode, setMode] = useState<Mode>(autoOpen ?? "token");
  const router = useRouter();

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    // veio de um link "?conectar=…": limpa a URL ao fechar
    if (!o && autoOpen) router.replace("/contas");
  };
  const close = () => onOpenChange(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary")}>
        + Conectar conta Supabase
      </button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Conectar conta Supabase</DialogTitle>
            <DialogDescription>Conecte quantas contas quiser, de e-mails diferentes.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">

          <div role="radiogroup" aria-label="Forma de conexão" className="grid gap-2 sm:grid-cols-2">
            <ModeOption
              active={mode === "token"}
              onClick={() => setMode("token")}
              title="Todas as organizações"
              badge="Recomendado"
              body="Cole um Access Token da conta. Todas as organizações entram de uma vez, inclusive as que você criar depois."
            />
            <ModeOption
              active={mode === "oauth"}
              onClick={() => setMode("oauth")}
              title="Uma organização (OAuth)"
              body="Autoriza uma organização por vez, com permissões mínimas. Bom para contas de clientes."
            />
          </div>

          {mode === "token" ? <TokenForm onDone={close} /> : <OAuthForm disabled={disabled} knownLogins={knownLogins} onCancel={close} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModeOption({ active, onClick, title, body, badge }: { active: boolean; onClick: () => void; title: string; body: string; badge?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left text-sm transition ${
        active
          ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600 dark:bg-emerald-950/40"
          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
      }`}
    >
      <span className="flex items-center justify-between gap-2 font-medium">
        {title}
        {badge && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white uppercase">{badge}</span>}
      </span>
      <span className="mt-1 block text-xs text-zinc-500">{body}</span>
    </button>
  );
}

function TokenForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<PatResult | null, FormData>(connectPatAction, null);
  const [shown, setShown] = useState(false);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="ok" title={state.message}>
          {state.data?.added.length ? <>Novas: {state.data.added.join(", ")}.</> : "Nenhuma organização nova; as existentes foram atualizadas."}
        </Notice>
        <div className="flex justify-end">
          <button type="button" onClick={onDone} className={buttonClass("primary")}>Concluir</button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex-1">
            <p className="font-medium">Abra a página de tokens logado na conta desejada</p>
            <p className="mt-1 text-zinc-500">Se o supabase.com estiver em outra conta, saia (avatar → Log out) e entre com a certa.</p>
            <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer" className={buttonClass("secondary", "mt-2 px-2.5 py-1 text-xs")}>
              Abrir Access Tokens ↗
            </a>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="flex-1">
            <p className="font-medium">Gere um token</p>
            <p className="mt-1 text-zinc-500">
              <em>Generate new token</em>, nome <strong>BaseHub</strong>. Escolher uma expiração é mais seguro; quando vencer, o Hub avisa para
              colar um novo.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <div className="flex-1">
            <label htmlFor="pat" className="font-medium">Cole o token aqui</label>
            <div className="relative mt-2">
              <input
                id="pat"
                name="token"
                type={shown ? "text" : "password"}
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="sbp_..."
                className={`${inputClass} pr-20 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShown((s) => !s)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {shown ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              O e-mail da conta é identificado pelo próprio token. Ele fica criptografado (AES-256-GCM). Colar o token de um login já
              conectado só atualiza o token.
            </p>
          </div>
        </li>
      </ol>

      {state && !state.ok && <Notice tone="error" title="Não foi possível conectar">{state.message}</Notice>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className={buttonClass("secondary")}>Cancelar</button>
        <button disabled={pending} className={buttonClass("primary")}>
          {pending && <Spinner />}
          {pending ? "Buscando organizações…" : "Conectar todas as organizações"}
        </button>
      </div>
    </form>
  );
}

function OAuthForm({ disabled, knownLogins, onCancel }: { disabled?: boolean; knownLogins: string[]; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const isKnown = knownLogins.includes(email.trim().toLowerCase());

  if (disabled) {
    return (
      <Notice tone="warn" title="OAuth App ainda não configurado">
        Use a opção Access Token ou configure o OAuth App (veja Ajuda).
      </Notice>
    );
  }

  return (
    // GET nativo: a rota redireciona para o supabase.com
    <form action="/api/supabase/connect" method="get" className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex-1">
            <label htmlFor="oauth-login" className="font-medium">Qual e-mail do Supabase você vai usar?</label>
            <input
              id="oauth-login"
              type="email"
              name="login"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex.: cliente@empresa.com (opcional)"
              className={`${inputClass} mt-2`}
            />
            <p className="mt-1 text-xs text-zinc-500">Ajuda o Hub a identificar o login (o OAuth do Supabase não informa o e-mail).</p>
            {isKnown && <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">Esse login já está conectado. Continuar vai trazer outra organização dele ou renovar o acesso.</p>}
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={2} />
          <div className="flex-1">
            <p className="font-medium">Use o login certo no supabase.com</p>
            <p className="mt-1 text-zinc-500">
              O Supabase autoriza com a conta logada no navegador. Para outro e-mail, saia do supabase.com antes (avatar → <em>Log out</em>):
              a tela de login do Supabase vai aparecer.
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} />
              Estou com o login certo (ou deslogado)
            </label>
          </div>
        </li>
        <li className="flex gap-3">
          <Step n={3} />
          <div className="flex-1">
            <p className="font-medium">Escolha a organização e autorize</p>
            <p className="mt-1 text-zinc-500">Uma organização por vez. Repita para as outras.</p>
          </div>
        </li>
      </ol>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass("secondary")}>Cancelar</button>
        <button disabled={!ready} className={buttonClass("primary")} title={ready ? undefined : "Confirme o passo 2"}>
          Continuar para o Supabase →
        </button>
      </div>
    </form>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
      {n}
    </span>
  );
}
