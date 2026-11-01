import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createHash, randomBytes } from "node:crypto";
import { awsClientConfig } from "./aws";
import { env } from "./env";
import type { GuestRole } from "./roles";

// Compartilhamento de bancos entre contas do BaseHub. No DynamoDB:
//   pk=T#<dono>       sk=SHARE#<ref>#<email>   membro (pendente ou ativo) visto pelo dono
//   pk=T#<convidado>  sk=SHARED#<ref>          acesso aceito, visto pelo convidado
//   pk=INVITE#<hash>  sk=META                  convite (token só como hash, expira em 7 dias)

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});
const T = (tenant: string) => `T#${tenant}`;
const sha = (s: string) => createHash("sha256").update(s).digest("base64url");
const nowIso = () => new Date().toISOString();
export const INVITE_DAYS = 7;

export type ShareMember = {
  ref: string;
  orgSlug: string;
  projectName: string;
  email: string;
  role: GuestRole;
  status: "pending" | "active";
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  guestTenant?: string;
  /** hash do token do convite pendente (para cancelar/reenviar) */
  inviteHash?: string;
  inviteExpiresAt?: string;
  /** ações do MCP liberadas pelo dono/Admin (sem valor = padrão do papel) */
  mcpTools?: string[];
};

export type SharedWithMe = {
  ref: string;
  orgSlug: string;
  ownerTenant: string;
  ownerEmail: string;
  projectName: string;
  role: GuestRole;
  acceptedAt: string;
  mcpTools?: string[];
};

export type Invite = {
  ownerTenant: string;
  ownerEmail: string;
  ref: string;
  orgSlug: string;
  projectName: string;
  email: string;
  role: GuestRole;
  invitedBy: string;
  expiresAt: string;
};

const memberKey = (owner: string, ref: string, email: string) => ({ pk: T(owner), sk: `SHARE#${ref}#${email}` });

function strip<X>(item: Record<string, unknown> | undefined): X | null {
  if (!item) return null;
  const rest = { ...item };
  delete rest.pk;
  delete rest.sk;
  delete rest.ttl;
  return rest as X;
}

export async function listMembers(owner: string, ref: string): Promise<ShareMember[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: env.table,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :p)",
      ExpressionAttributeValues: { ":pk": T(owner), ":p": `SHARE#${ref}#` },
    }),
  );
  return (out.Items ?? []).map((i) => strip<ShareMember>(i)!).sort((a, b) => a.email.localeCompare(b.email));
}

export async function getMember(owner: string, ref: string, email: string): Promise<ShareMember | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: memberKey(owner, ref, email) }));
  return strip<ShareMember>(out.Item);
}

/** Bancos que outras contas compartilharam comigo. */
export async function listSharedWithMe(guest: string): Promise<SharedWithMe[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: env.table,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :p)",
      ExpressionAttributeValues: { ":pk": T(guest), ":p": "SHARED#" },
    }),
  );
  return (out.Items ?? []).map((i) => strip<SharedWithMe>(i)!);
}

export async function getSharedWithMe(guest: string, ref: string): Promise<SharedWithMe | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: T(guest), sk: `SHARED#${ref}` } }));
  return strip<SharedWithMe>(out.Item);
}

/** Cria (ou renova) um convite pendente. Devolve o token em claro só para montar o link. */
export async function createInvite(input: Omit<Invite, "expiresAt">): Promise<{ token: string; member: ShareMember }> {
  const existing = await getMember(input.ownerTenant, input.ref, input.email);
  if (existing?.status === "active") throw new Error(`${input.email} já tem acesso a este banco.`);
  if (existing?.inviteHash) await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: `INVITE#${existing.inviteHash}`, sk: "META" } }));

  const token = randomBytes(24).toString("base64url");
  const hash = sha(token);
  const expires = new Date(Date.now() + INVITE_DAYS * 86400_000);
  const invite: Invite = { ...input, expiresAt: expires.toISOString() };
  const member: ShareMember = {
    ref: input.ref,
    orgSlug: input.orgSlug,
    projectName: input.projectName,
    email: input.email,
    role: input.role,
    status: "pending",
    invitedBy: input.invitedBy,
    invitedAt: nowIso(),
    inviteHash: hash,
    inviteExpiresAt: invite.expiresAt,
  };
  await Promise.all([
    doc.send(new PutCommand({ TableName: env.table, Item: { pk: `INVITE#${hash}`, sk: "META", ...invite, ttl: Math.floor(expires.getTime() / 1000) } })),
    doc.send(new PutCommand({ TableName: env.table, Item: { ...memberKey(input.ownerTenant, input.ref, input.email), ...member } })),
  ]);
  return { token, member };
}

export async function getInvite(token: string): Promise<(Invite & { hash: string }) | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const hash = sha(token);
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: `INVITE#${hash}`, sk: "META" } }));
  const inv = strip<Invite>(out.Item);
  if (!inv || new Date(inv.expiresAt).getTime() < Date.now()) return null;
  return { ...inv, hash };
}

/** Aceita: grava o acesso do convidado, ativa o membro e apaga o convite (uso único). */
export async function acceptInvite(inv: Invite & { hash: string }, guestTenant: string) {
  const acceptedAt = nowIso();
  const shared: SharedWithMe = {
    ref: inv.ref,
    orgSlug: inv.orgSlug,
    ownerTenant: inv.ownerTenant,
    ownerEmail: inv.ownerEmail,
    projectName: inv.projectName,
    role: inv.role,
    acceptedAt,
    mcpTools: undefined as string[] | undefined,
  };
  const member = await getMember(inv.ownerTenant, inv.ref, inv.email);
  shared.mcpTools = member?.mcpTools;
  await Promise.all([
    doc.send(new PutCommand({ TableName: env.table, Item: { pk: T(guestTenant), sk: `SHARED#${inv.ref}`, ...shared } })),
    doc.send(
      new PutCommand({
        TableName: env.table,
        Item: {
          ...memberKey(inv.ownerTenant, inv.ref, inv.email),
          ...(member ?? {}),
          ref: inv.ref,
          orgSlug: inv.orgSlug,
          projectName: inv.projectName,
          email: inv.email,
          role: inv.role,
          invitedBy: member?.invitedBy ?? inv.invitedBy,
          invitedAt: member?.invitedAt ?? acceptedAt,
          status: "active",
          acceptedAt,
          guestTenant,
          inviteHash: undefined,
          inviteExpiresAt: undefined,
        },
      }),
    ),
    doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: `INVITE#${inv.hash}`, sk: "META" } })),
  ]);
}

/** Recusa ou cancela: apaga o convite e o membro pendente. */
export async function dropInvite(inv: { ownerTenant: string; ref: string; email: string; hash?: string }) {
  await Promise.all([
    inv.hash ? doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: `INVITE#${inv.hash}`, sk: "META" } })) : null,
    doc.send(new DeleteCommand({ TableName: env.table, Key: memberKey(inv.ownerTenant, inv.ref, inv.email) })),
  ]);
}

/** Revoga (ou "sair do banco"): some dos dois lados e invalida convite pendente. */
export async function removeMember(owner: string, ref: string, email: string) {
  const m = await getMember(owner, ref, email);
  if (!m) return;
  await Promise.all([
    doc.send(new DeleteCommand({ TableName: env.table, Key: memberKey(owner, ref, email) })),
    m.guestTenant ? doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: T(m.guestTenant), sk: `SHARED#${ref}` } })) : null,
    m.inviteHash ? doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: `INVITE#${m.inviteHash}`, sk: "META" } })) : null,
  ]);
}

export async function changeRole(owner: string, ref: string, email: string, role: GuestRole) {
  const m = await getMember(owner, ref, email);
  if (!m) throw new Error("Esta pessoa não tem mais acesso.");
  await doc.send(new PutCommand({ TableName: env.table, Item: { ...memberKey(owner, ref, email), ...m, role } }));
  if (m.guestTenant) {
    const s = await getSharedWithMe(m.guestTenant, ref);
    if (s) await doc.send(new PutCommand({ TableName: env.table, Item: { pk: T(m.guestTenant), sk: `SHARED#${ref}`, ...s, role } }));
  }
}

/** Ao excluir o banco, some o compartilhamento de todo mundo. */
export async function removeAllMembers(owner: string, ref: string) {
  for (const m of await listMembers(owner, ref)) await removeMember(owner, ref, m.email);
}

/** Dono/Admin escolhe as ações do MCP de uma pessoa neste banco (os dois lados ficam iguais). */
export async function setMemberMcp(owner: string, ref: string, email: string, tools: string[] | undefined) {
  const m = await getMember(owner, ref, email);
  if (!m) throw new Error("Esta pessoa não tem mais acesso.");
  await doc.send(new PutCommand({ TableName: env.table, Item: { ...memberKey(owner, ref, email), ...m, mcpTools: tools } }));
  if (m.guestTenant) {
    const s = await getSharedWithMe(m.guestTenant, ref);
    if (s) await doc.send(new PutCommand({ TableName: env.table, Item: { pk: T(m.guestTenant), sk: `SHARED#${ref}`, ...s, mcpTools: tools } }));
  }
}
