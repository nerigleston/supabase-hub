"use server";

import { redirect } from "next/navigation";
import {
  authErrorMessage,
  completeNewPassword,
  confirmForgotPassword,
  confirmSignUp,
  forgotPassword,
  resendCode,
  signIn,
  signUp,
} from "@/lib/cognito";
import { env } from "@/lib/env";
import { clearChallenge, createSession, getChallenge, setChallenge } from "@/lib/session";

export type FormState = { error?: string; info?: string; fields?: Record<string, string> } | null;

const str = (form: FormData, key: string) => String(form.get(key) ?? "");
const q = (email: string) => `email=${encodeURIComponent(email.trim().toLowerCase())}`;

/** Só aceita caminhos internos para o redirect pós-login. */
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/painel";
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  const password = str(form, "password");
  if (!email || !password) return { error: "Preencha e-mail e senha.", fields: { email } };

  let result;
  try {
    result = await signIn(email, password);
  } catch (err) {
    return { error: authErrorMessage(err), fields: { email } };
  }

  if (result.kind === "unconfirmed") {
    await resendCode(email).catch(() => {});
    redirect(`/confirmar?${q(email)}&reenviado=1`);
  }
  if (result.kind === "new_password") {
    await setChallenge(email.trim().toLowerCase(), result.session);
    redirect("/nova-senha");
  }
  await createSession(result);
  redirect(safeNext(str(form, "next")));
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = str(form, "name");
  const email = str(form, "email");
  const password = str(form, "password");
  const fields = { name, email };
  // A trava vale no servidor: esconder o formulário não basta.
  if (!env.signupOpen) return { error: "O cadastro está fechado no momento.", fields };
  if (!email || !password) return { error: "Preencha e-mail e senha.", fields };
  if (password !== str(form, "confirm")) return { error: "As senhas não são iguais.", fields };
  if (!form.get("terms")) return { error: "Para criar a conta, aceite os termos de uso.", fields };

  try {
    await signUp(email, password, name);
  } catch (err) {
    return { error: authErrorMessage(err), fields };
  }
  redirect(`/confirmar?${q(email)}`);
}

export async function confirmAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  const code = str(form, "code");
  if (!/^\d{6}$/.test(code.trim())) return { error: "O código tem 6 números.", fields: { email } };
  try {
    await confirmSignUp(email, code);
  } catch (err) {
    return { error: authErrorMessage(err), fields: { email } };
  }
  redirect(`/login?${q(email)}&confirmado=1`);
}

export async function resendAction(email: string): Promise<FormState> {
  try {
    await resendCode(email);
    return { info: "Enviamos um novo código. Confira também a caixa de spam." };
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
}

export async function forgotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  if (!email) return { error: "Informe o e-mail da conta." };
  try {
    await forgotPassword(email);
  } catch (err) {
    return { error: authErrorMessage(err), fields: { email } };
  }
  redirect(`/redefinir-senha?${q(email)}`);
}

export async function resetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  const code = str(form, "code");
  const password = str(form, "password");
  if (password !== str(form, "confirm")) return { error: "As senhas não são iguais.", fields: { email, code } };
  try {
    await confirmForgotPassword(email, code, password);
  } catch (err) {
    return { error: authErrorMessage(err), fields: { email, code } };
  }
  redirect(`/login?${q(email)}&senha=1`);
}

export async function newPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const challenge = await getChallenge();
  if (!challenge) redirect("/login?erro=expirado");
  const password = str(form, "password");
  if (password !== str(form, "confirm")) return { error: "As senhas não são iguais." };
  let identity;
  try {
    identity = await completeNewPassword(challenge.email, challenge.session, password);
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  await clearChallenge();
  await createSession(identity);
  redirect("/painel");
}
