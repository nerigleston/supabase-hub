"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  confirmAction,
  forgotAction,
  type FormState,
  loginAction,
  newPasswordAction,
  resendAction,
  resendResetAction,
  resetAction,
  verifyResetCodeAction,
  signUpAction,
} from "@/app/(auth)/actions";
import { AuthHeader, CodeInput, EmailField, Field, NewPasswordFields, PasswordField, ResendCodeButton, SubmitButton, useFormFeedback } from "./auth-fields";
import { TextLink } from "./app-ui";

export function LoginForm({ email, next, info, signupOpen }: { email?: string; next?: string; info?: string; signupOpen: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, null);
  const feedback = useFormFeedback(state, info);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? "/painel"} />
      <EmailField label="E-mail" name="email" required autoComplete="email" autoFocus={!email} defaultValue={state?.fields?.email ?? email} />
      <PasswordField
        autoFocus={Boolean(email)}
        aside={<TextLink href={`/esqueci-senha${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-xs">Esqueci minha senha</TextLink>}
      />
      <SubmitButton pendingLabel="Entrando…">Entrar</SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        Ainda não tem conta? <TextLink href="/cadastro">{signupOpen ? "Criar conta" : "Pedir acesso"}</TextLink>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpAction, null);
  const feedback = useFormFeedback(state);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <Field label="Nome" name="name" autoComplete="name" autoFocus defaultValue={state?.fields?.name} placeholder="Como devemos te chamar" />
      <EmailField label="E-mail" name="email" required autoComplete="email" defaultValue={state?.fields?.email} />
      <NewPasswordFields label="Senha" />
      <label className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        <input type="checkbox" name="terms" required className="mt-1" />
        <span>Li e aceito os termos de uso e a política de privacidade.</span>
      </label>
      <SubmitButton pendingLabel="Criando conta…">Criar conta</SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        Já tem conta? <TextLink href="/login">Entrar</TextLink>
      </p>
    </form>
  );
}

export function ConfirmForm({ email, resent }: { email: string; resent?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(confirmAction, null);
  const feedback = useFormFeedback(state, resent ? "Sua conta ainda não foi confirmada. Enviamos um novo código." : undefined);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-5">
      <input type="hidden" name="email" value={email} />
      <CodeInput hint="O código vale 15 minutos. Dá para colar o código inteiro." />
      <SubmitButton pendingLabel="Confirmando…">Confirmar e-mail</SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        Não chegou? <ResendCodeButton onResend={() => resendAction(email)} /> · <TextLink href="/cadastro">Usar outro e-mail</TextLink>
      </p>
    </form>
  );
}

export function ForgotForm({ email }: { email?: string }) {
  const [state, action] = useActionState<FormState, FormData>(forgotAction, null);
  const feedback = useFormFeedback(state);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <EmailField label="E-mail da conta" name="email" required autoComplete="email" autoFocus defaultValue={state?.fields?.email ?? email} />
      <SubmitButton pendingLabel="Enviando…">Enviar código</SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        Lembrou? <TextLink href="/login">Voltar ao login</TextLink>
      </p>
    </form>
  );
}

/**
 * Troca de senha em dois passos na mesma tela:
 * 2) código: valida sozinho ao completar os 6 dígitos;
 * 3) nova senha + confirmação (o servidor confere o código de novo ao salvar).
 */
export function ResetForm({ email }: { email: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetAction, null);
  const feedback = useFormFeedback(state);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [checking, startCheck] = useTransition();

  // o código ficou inválido no passo final (ex.: expirou): volta para o passo do código
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.error && /código/i.test(state.error)) {
      setCode(null);
      setError(state.error);
    }
  }

  const verify = (value: string) =>
    startCheck(async () => {
      const r = await verifyResetCodeAction(email, value);
      if (r.ok) {
        setError(null);
        setCode(value);
      } else {
        setError(r.message);
        setResetKey((k) => k + 1);
      }
    });

  const other = (
    <Link href={`/esqueci-senha?email=${encodeURIComponent(email)}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
      Usar outro e-mail
    </Link>
  );

  if (!code)
    return (
      <>
        <AuthHeader
          step="Passo 2 de 3"
          title="Digite o código"
          subtitle={
            <>
              Enviamos um código de 6 dígitos para <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong> (se existir uma conta com
              ele). Pode levar um minuto; confira também o spam.
            </>
          }
        />
        <div className="flex flex-col gap-5">
          <CodeInput resetKey={resetKey} disabled={checking} onComplete={verify} hint="O código vale 15 minutos. Dá para colar o código inteiro." />
          <p aria-live="polite" className={`-mt-2 min-h-5 text-sm ${error ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`}>
            {checking ? "Conferindo o código…" : error}
          </p>
          <p className="text-center text-sm text-zinc-500">
            Não chegou? <ResendCodeButton onResend={() => resendResetAction(email)} /> · {other}
          </p>
        </div>
      </>
    );

  return (
    <>
      <AuthHeader step="Passo 3 de 3" title="Crie a nova senha" subtitle={<>Para a conta <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong>.</>} />
      <form action={action} {...feedback} className="flex flex-col gap-5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="code" value={code} />
        <p className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span>✓ Código confirmado</span>
          <button
            type="button"
            onClick={() => {
              setCode(null);
              setError(null);
              setResetKey((k) => k + 1);
            }}
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Trocar código
          </button>
        </p>
        <NewPasswordFields autoFocus />
        <SubmitButton pendingLabel="Salvando…">Salvar nova senha</SubmitButton>
      </form>
    </>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(newPasswordAction, null);
  const feedback = useFormFeedback(state);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <NewPasswordFields autoFocus />
      <SubmitButton pendingLabel="Salvando…">Definir senha e entrar</SubmitButton>
    </form>
  );
}
