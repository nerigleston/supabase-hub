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
  resetAction,
  signUpAction,
} from "@/app/(auth)/actions";
import { EmailField, Field, PasswordField, SubmitButton, useFormFeedback } from "./auth-fields";
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
      <PasswordField showRules autoComplete="new-password" />
      <PasswordField label="Confirmar senha" name="confirm" autoComplete="new-password" />
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
  const [resend, setResend] = useState<FormState>(resent ? { info: "Sua conta ainda não foi confirmada. Enviamos um novo código." } : null);
  const [pending, start] = useTransition();
  const feedback = useFormFeedback(state);
  useFormFeedback(resend);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <Field
        label="Código de 6 dígitos"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        placeholder="000000"
        className="tracking-[0.5em]"
      />
      <SubmitButton pendingLabel="Confirmando…">Confirmar e-mail</SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        Não chegou?{" "}
        <button type="button" disabled={pending} onClick={() => start(async () => setResend(await resendAction(email)))} className="font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400">
          {pending ? "Enviando…" : "Reenviar código"}
        </button>{" "}
        · <TextLink href="/cadastro">Usar outro e-mail</TextLink>
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

export function ResetForm({ email }: { email: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetAction, null);
  const feedback = useFormFeedback(state);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <Field label="Código recebido por e-mail" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus defaultValue={state?.fields?.code} placeholder="000000" className="tracking-[0.5em]" />
      <PasswordField label="Nova senha" showRules autoComplete="new-password" />
      <PasswordField label="Confirmar nova senha" name="confirm" autoComplete="new-password" />
      <SubmitButton pendingLabel="Salvando…">Salvar nova senha</SubmitButton>
      <p className="text-center text-sm text-zinc-500">
        Não recebeu? <Link href={`/esqueci-senha?email=${encodeURIComponent(email)}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Pedir outro código</Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(newPasswordAction, null);
  const feedback = useFormFeedback(state);
  return (
    <form action={action} {...feedback} className="flex flex-col gap-4">
      <PasswordField label="Nova senha" showRules autoComplete="new-password" autoFocus />
      <PasswordField label="Confirmar nova senha" name="confirm" autoComplete="new-password" />
      <SubmitButton pendingLabel="Salvando…">Definir senha e entrar</SubmitButton>
    </form>
  );
}
