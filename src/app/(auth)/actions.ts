"use server";

import { redirect } from "next/navigation";
import { adminConfirm, adminSetPassword, authErrorMessage, completeNewPassword, signIn, signUp, userStatus } from "@/lib/cognito";
import { checkCode, CodeError, codeMessage, consumeCode, sendResetCode, sendSignupCode } from "@/lib/email-codes";
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
    await sendSignupCode(email).catch(() => {});
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
  // o código sai pelo Resend (o Cognito não envia e-mail); se falhar, a tela de confirmação oferece reenviar
  await sendSignupCode(email).catch(() => {});
  redirect(`/confirmar?${q(email)}`);
}

export async function confirmAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").trim().toLowerCase();
  const code = str(form, "code").trim();
  if (!/^\d{6}$/.test(code)) return { error: "O código tem 6 números.", fields: { email } };
  try {
    const check = await checkCode("signup", email, code);
    if (check !== "ok") return { error: codeMessage[check], fields: { email } };
    await adminConfirm(email);
    await consumeCode("signup", email);
  } catch (err) {
    return { error: authErrorMessage(err), fields: { email } };
  }
  redirect(`/login?${q(email)}&confirmado=1`);
}

export async function resendAction(email: string): Promise<FormState> {
  const info: FormState = { info: "Se houver um cadastro pendente com este e-mail, enviamos um novo código. Confira também a caixa de spam." };
  try {
    // só conta não confirmada recebe código de cadastro; a resposta é a mesma (não revela quem tem conta)
    if ((await userStatus(email)) === "UNCONFIRMED") await sendSignupCode(email);
    return info;
  } catch (err) {
    if (err instanceof CodeError) return { error: err.message };
    return { error: authErrorMessage(err) };
  }
}

export async function forgotAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").trim().toLowerCase();
  if (!email) return { error: "Informe o e-mail da conta." };
  try {
    // mesma resposta exista ou não a conta (não revela quem está cadastrado)
    if (await userStatus(email)) await sendResetCode(email);
  } catch (err) {
    if (err instanceof CodeError) return { error: err.message, fields: { email } };
    return { error: authErrorMessage(err), fields: { email } };
  }
  redirect(`/redefinir-senha?${q(email)}`);
}

export async function resetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").trim().toLowerCase();
  const code = str(form, "code").trim();
  const password = str(form, "password");
  if (password !== str(form, "confirm")) return { error: "As senhas não são iguais.", fields: { email, code } };
  if (!/^\d{6}$/.test(code)) return { error: "O código tem 6 números.", fields: { email, code } };
  try {
    const check = await checkCode("reset", email, code);
    if (check !== "ok") return { error: codeMessage[check], fields: { email, code } };
    // a política de senha é do Cognito: se a senha não servir, o código continua valendo
    await adminSetPassword(email, password);
    // trocar a senha pelo e-mail também prova que o e-mail é dela
    await adminConfirm(email);
    await consumeCode("reset", email);
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
