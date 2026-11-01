import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { awsClientConfig } from "./aws";
import { escapeHtml as esc, layout, sendEmail } from "./email";
import { env } from "./env";

// Códigos de e-mail do próprio BaseHub (cadastro e troca de senha), enviados pelo
// Resend. O Cognito não manda mais e-mail: o app confere o código e confirma a
// conta / define a senha pelas APIs de admin do Cognito.
//   pk=CODE#<finalidade>#<email>  sk=META  { hash, expiresAt, attempts, sentAt, ttl }
// Só o HMAC do código é guardado. Vale 15 min, 5 tentativas, 1 envio por minuto.

export type CodePurpose = "signup" | "reset";
const TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60_000;

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});
const key = (purpose: CodePurpose, email: string) => ({ pk: `CODE#${purpose}#${email.trim().toLowerCase()}`, sk: "META" });
const digest = (purpose: CodePurpose, email: string, code: string) =>
  createHmac("sha256", env.sessionSecret).update(`${purpose}:${email.trim().toLowerCase()}:${code}`).digest();

export class CodeError extends Error {}

/** Gera e guarda um código novo (invalida o anterior). Devolve o código em claro só para enviar. */
export async function createCode(purpose: CodePurpose, email: string): Promise<string> {
  const k = key(purpose, email);
  const prev = await doc.send(new GetCommand({ TableName: env.table, Key: k }));
  if (prev.Item && Date.now() - Number(prev.Item.sentAt) < RESEND_AFTER_MS)
    throw new CodeError("Acabamos de enviar um código. Aguarde um minuto para pedir outro.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = Date.now() + TTL_MIN * 60_000;
  await doc.send(
    new PutCommand({
      TableName: env.table,
      Item: { ...k, hash: digest(purpose, email, code).toString("base64"), expiresAt, attempts: 0, sentAt: Date.now(), ttl: Math.floor(expiresAt / 1000) + 3600 },
    }),
  );
  return code;
}

export type CodeCheck = "ok" | "mismatch" | "expired" | "locked";

/** Confere o código. Errar soma tentativa; acertar não apaga (chame consumeCode depois de concluir). */
export async function checkCode(purpose: CodePurpose, email: string, codeRaw: string): Promise<CodeCheck> {
  const k = key(purpose, email);
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: k }));
  const item = out.Item;
  if (!item || Number(item.expiresAt) < Date.now()) return "expired";
  if (Number(item.attempts) >= MAX_ATTEMPTS) return "locked";
  const expected = Buffer.from(String(item.hash), "base64");
  const got = digest(purpose, email, codeRaw.trim());
  if (expected.length === got.length && timingSafeEqual(expected, got)) return "ok";
  await doc.send(new UpdateCommand({ TableName: env.table, Key: k, UpdateExpression: "ADD attempts :one", ExpressionAttributeValues: { ":one": 1 } }));
  return "mismatch";
}

export async function consumeCode(purpose: CodePurpose, email: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: key(purpose, email) }));
}

export const codeMessage: Record<Exclude<CodeCheck, "ok">, string> = {
  mismatch: "Código incorreto. Confira o último e-mail recebido.",
  expired: "Este código expirou ou já foi usado. Peça um novo.",
  locked: "Muitas tentativas com este código. Peça um novo.",
};

function codeHtml(code: string) {
  return `<span style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;color:#18181b;font-family:ui-monospace,Menlo,monospace">${esc(code)}</span>`;
}

const FOOTER = "Você recebeu este e-mail porque este endereço foi usado no BaseHub. Nunca pedimos este código por telefone ou chat.";

/** Envia o código de confirmação de cadastro. */
export async function sendSignupCode(email: string) {
  const code = await createCode("signup", email);
  const r = await sendEmail({
    to: email,
    subject: `${code} é o seu código do BaseHub`,
    html: layout({
      title: "Confirme seu e-mail",
      intro: "Use este código para confirmar o seu cadastro no BaseHub:",
      lines: [codeHtml(code), `Ele vale por ${TTL_MIN} minutos.`],
      footer: FOOTER,
    }),
    text: `Seu código do BaseHub: ${code}\n\nEle vale por ${TTL_MIN} minutos.`,
  });
  if (!r.ok) throw new CodeError("Não conseguimos enviar o e-mail agora. Tente de novo em instantes.");
}

/** Envia o código de troca de senha. */
export async function sendResetCode(email: string) {
  const code = await createCode("reset", email);
  const r = await sendEmail({
    to: email,
    subject: `${code} é o código para trocar sua senha do BaseHub`,
    html: layout({
      title: "Troca de senha",
      intro: "Recebemos um pedido para trocar a senha da sua conta. Use este código:",
      lines: [codeHtml(code), `Ele vale por ${TTL_MIN} minutos. Se não foi você, ignore este e-mail: sua senha continua a mesma.`],
      footer: FOOTER,
    }),
    text: `Código para trocar sua senha do BaseHub: ${code}\n\nVale por ${TTL_MIN} minutos. Se não foi você, ignore este e-mail.`,
  });
  if (!r.ok) throw new CodeError("Não conseguimos enviar o e-mail agora. Tente de novo em instantes.");
}
