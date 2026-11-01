// Gatilho "Custom Email Sender" do Cognito: em vez do remetente padrão da AWS
// (limite de 50/dia), os e-mails de código (cadastro, reenvio, troca de senha,
// troca de e-mail) saem pelo Resend, com o modelo do BaseHub.
//
// O Cognito entrega o código criptografado com KMS (AWS Encryption SDK); a função
// descriptografa com a mesma chave e envia. Variáveis: RESEND_API_KEY, EMAIL_FROM,
// KEY_ARN, APP_URL.

import { buildClient, CommitmentPolicy, KmsKeyringNode } from "@aws-crypto/client-node";

const { decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);
const keyring = new KmsKeyringNode({ keyIds: [process.env.KEY_ARN] });
const APP = (process.env.APP_URL || "https://basehub.nerifilho.com.br").replace(/\/$/, "");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout({ title, intro, code, after, footer }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px"><tr><td>
<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#18181b"><span style="color:#059669">base</span>hub</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#18181b">${esc(title)}</h1>
<p style="margin:0 0 16px;color:#3f3f46;font-size:14px;line-height:1.6">${intro}</p>
<p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:6px;color:#18181b;font-family:ui-monospace,Menlo,monospace">${esc(code)}</p>
<p style="margin:0 0 12px;color:#3f3f46;font-size:14px;line-height:1.6">${after}</p>
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #f4f4f5;color:#a1a1aa;font-size:12px;line-height:1.5">${footer}</p>
</td></tr></table></td></tr></table></body></html>`;
}

const TEMPLATES = {
  CustomEmailSender_SignUp: (code) => ({
    subject: `${code} é o seu código do BaseHub`,
    title: "Confirme seu e-mail",
    intro: "Use este código para confirmar o seu cadastro no BaseHub:",
    after: `Ele vale por 24 horas. Se a tela fechou, abra ${esc(APP)}/confirmar e informe o código.`,
  }),
  CustomEmailSender_ResendCode: (code) => ({
    subject: `${code} é o seu novo código do BaseHub`,
    title: "Seu novo código",
    intro: "Use este código para confirmar o seu e-mail no BaseHub:",
    after: "Ele substitui os códigos enviados antes.",
  }),
  CustomEmailSender_ForgotPassword: (code) => ({
    subject: `${code} é o código para trocar sua senha do BaseHub`,
    title: "Troca de senha",
    intro: "Recebemos um pedido para trocar a senha da sua conta. Use este código:",
    after: "Se não foi você, ignore este e-mail: sua senha continua a mesma.",
  }),
  CustomEmailSender_UpdateUserAttribute: (code) => ({
    subject: `${code} é o código para confirmar seu novo e-mail`,
    title: "Confirme o novo e-mail",
    intro: "Use este código para confirmar o novo e-mail da sua conta no BaseHub:",
    after: "Se não foi você, ignore este e-mail.",
  }),
  CustomEmailSender_VerifyUserAttribute: (code) => ({
    subject: `${code} é o seu código do BaseHub`,
    title: "Confirme seu e-mail",
    intro: "Use este código para confirmar o seu e-mail no BaseHub:",
    after: "Se não foi você, ignore este e-mail.",
  }),
  CustomEmailSender_AdminCreateUser: (code) => ({
    subject: "Sua conta no BaseHub foi criada",
    title: "Bem-vindo ao BaseHub",
    intro: "Uma conta foi criada para você. Esta é a sua senha temporária:",
    after: `Entre em ${esc(APP)}/login com este e-mail e defina uma senha nova no primeiro acesso.`,
  }),
};

export const handler = async (event) => {
  const make = TEMPLATES[event.triggerSource];
  if (!make) return event; // ex.: AccountTakeOverNotification: não usamos
  const to = event.request.userAttributes?.email;
  if (!to || !event.request.code) return event;

  const { plaintext } = await decrypt(keyring, Buffer.from(event.request.code, "base64"));
  const code = plaintext.toString("utf8");
  const t = make(code);
  const footer = "Você recebeu este e-mail porque alguém usou este endereço no BaseHub. Nunca pedimos este código por telefone ou chat.";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "BaseHub <convites@nerifilho.com.br>",
      to: [to],
      subject: t.subject,
      html: layout({ title: t.title, intro: t.intro, code, after: t.after, footer }),
      text: `${t.title}\n\n${t.intro}\n\n${code}\n\n${t.after.replace(/<[^>]+>/g, "")}`,
    }),
  });
  // falha aqui faz o Cognito devolver erro na tela (o usuário pode pedir de novo)
  if (!res.ok) throw new Error(`Resend respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return event;
};
