import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { awsClientConfig } from "./aws";
import { env } from "./env";

// Tabela única, particionada por tenant (multi-tenant / SaaS):
//   pk=T#<tenant>  sk=CONN#<orgSlug>       conexão OAuth com uma organização Supabase
//   pk=T#<tenant>  sk=PWD#<ref>            senha do banco conhecida pelo painel
//   pk=T#<tenant>  sk=LOG#<iso>#<uuid>     auditoria (expira via ttl)
// Hoje tenant = sub do usuário no Cognito; vira id de workspace quando houver times.

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});

const pk = (tenant: string) => `T#${tenant}`;

export type Connection = {
  tenantId: string;
  orgSlug: string;
  orgName: string;
  plan?: string;
  label?: string;
  accessToken: string; // criptografado
  refreshToken: string; // criptografado
  expiresAt: number; // epoch ms
  connectedAt: string;
  connectedBy: string;
  status: "ok" | "reauth";
  /** E-mail do login Supabase que autorizou (o OAuth não expõe; inferido pelos membros da org). */
  login?: string;
  loginVerified?: boolean;
  /** oauth: token por organização com refresh. pat: Access Token da conta (vale para todas as orgs do login). */
  authKind?: "oauth" | "pat";
  /** Para PAT: createdAt do login cujo token está gravado aqui. */
  tokenVersion?: string;
};

export type LogEntry = {
  at: string;
  user: string;
  action: string;
  target: string;
  ok: boolean;
  detail?: string;
};

function stripKeys<T>(item: Record<string, unknown>): T {
  const rest = { ...item };
  delete rest.pk;
  delete rest.sk;
  return rest as T;
}

async function queryPrefix(tenant: string, prefix: string, opts: { limit?: number; newestFirst?: boolean } = {}) {
  const out = await doc.send(
    new QueryCommand({
      TableName: env.table,
      KeyConditionExpression: "pk = :pk and begins_with(sk, :p)",
      ExpressionAttributeValues: { ":pk": pk(tenant), ":p": prefix },
      ScanIndexForward: !opts.newestFirst,
      Limit: opts.limit,
    }),
  );
  return out.Items ?? [];
}

// ---------- conexões ----------

export async function listConnections(tenant: string): Promise<Connection[]> {
  const items = (await queryPrefix(tenant, "CONN#")).map((i) => stripKeys<Connection>(i));
  return items.sort((a, b) => (a.label ?? a.orgName).localeCompare(b.label ?? b.orgName));
}

export async function getConnection(tenant: string, orgSlug: string): Promise<Connection | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `CONN#${orgSlug}` } }));
  return out.Item ? stripKeys<Connection>(out.Item) : null;
}

export async function putConnection(conn: Connection) {
  await doc.send(
    new PutCommand({ TableName: env.table, Item: { pk: pk(conn.tenantId), sk: `CONN#${conn.orgSlug}`, ...conn } }),
  );
}

/**
 * Grava tokens renovados só se ninguém renovou antes (refresh token rotaciona).
 * Retorna false se outra requisição ganhou a corrida.
 */
export async function updateTokens(
  tenant: string,
  orgSlug: string,
  previousExpiresAt: number,
  tokens: { accessToken: string; refreshToken: string; expiresAt: number },
): Promise<boolean> {
  try {
    await doc.send(
      new UpdateCommand({
        TableName: env.table,
        Key: { pk: pk(tenant), sk: `CONN#${orgSlug}` },
        UpdateExpression: "SET accessToken = :a, refreshToken = :r, expiresAt = :e, #s = :ok",
        ConditionExpression: "expiresAt = :prev",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":a": tokens.accessToken,
          ":r": tokens.refreshToken,
          ":e": tokens.expiresAt,
          ":prev": previousExpiresAt,
          ":ok": "ok",
        },
      }),
    );
    return true;
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

export async function setConnectionFields(
  tenant: string,
  orgSlug: string,
  fields: Partial<Pick<Connection, "status" | "label" | "login" | "loginVerified">>,
) {
  const entries = Object.entries(fields);
  const set = entries.filter(([, v]) => v !== undefined);
  const remove = entries.filter(([, v]) => v === undefined);
  const parts = [
    set.length ? "SET " + set.map(([k]) => `#${k} = :${k}`).join(", ") : "",
    remove.length ? "REMOVE " + remove.map(([k]) => `#${k}`).join(", ") : "",
  ].filter(Boolean);
  if (!parts.length) return;
  await doc.send(
    new UpdateCommand({
      TableName: env.table,
      Key: { pk: pk(tenant), sk: `CONN#${orgSlug}` },
      UpdateExpression: parts.join(" "),
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k]) => [`#${k}`, k])),
      ExpressionAttributeValues: set.length ? Object.fromEntries(set.map(([k, v]) => [`:${k}`, v])) : undefined,
    }),
  );
}

export async function deleteConnection(tenant: string, orgSlug: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `CONN#${orgSlug}` } }));
}

// ---------- logins por Access Token (PAT) ----------
//   pk=T#<tenant>  sk=PAT#<email>   token da conta inteira; sincroniza as orgs do login

export type PatLogin = {
  email: string;
  token: string; // criptografado
  createdAt: string;
  connectedBy: string;
  /** Orgs que o usuário desconectou: a sincronização não as traz de volta. */
  ignored?: string[];
};

export async function listPatLogins(tenant: string): Promise<PatLogin[]> {
  return (await queryPrefix(tenant, "PAT#")).map((i) => stripKeys<PatLogin>(i));
}

export async function getPatLogin(tenant: string, email: string): Promise<PatLogin | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `PAT#${email}` } }));
  return out.Item ? stripKeys<PatLogin>(out.Item) : null;
}

export async function putPatLogin(tenant: string, login: PatLogin) {
  await doc.send(new PutCommand({ TableName: env.table, Item: { pk: pk(tenant), sk: `PAT#${login.email}`, ...login } }));
}

export async function deletePatLogin(tenant: string, email: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `PAT#${email}` } }));
}

// ---------- keep-alive (ping diário para o Supabase não pausar) ----------
//   pk=T#<tenant>  sk=KA#<ref>

export type KeepAlive = {
  tenantId: string;
  ref: string;
  orgSlug: string;
  name: string;
  enabled: boolean;
  enabledAt: string;
  enabledBy: string;
  lastPingAt?: string;
  lastOk?: boolean;
  lastError?: string;
  /** Último "Pingar agora" (manual): usado no cooldown. */
  lastManualPingAt?: string;
};

export async function listKeepAlive(tenant: string): Promise<KeepAlive[]> {
  return (await queryPrefix(tenant, "KA#")).map((i) => stripKeys<KeepAlive>(i));
}

export async function putKeepAlive(ka: KeepAlive) {
  await doc.send(new PutCommand({ TableName: env.table, Item: { pk: pk(ka.tenantId), sk: `KA#${ka.ref}`, ...ka } }));
}

export async function recordPing(tenant: string, ref: string, result: { ok: boolean; error?: string }) {
  await doc.send(
    new UpdateCommand({
      TableName: env.table,
      Key: { pk: pk(tenant), sk: `KA#${ref}` },
      UpdateExpression: result.error ? "SET lastPingAt = :at, lastOk = :ok, lastError = :e" : "SET lastPingAt = :at, lastOk = :ok REMOVE lastError",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: {
        ":at": new Date().toISOString(),
        ":ok": result.ok,
        ...(result.error ? { ":e": result.error.slice(0, 300) } : {}),
      },
    }),
  );
}

/** Todos os keep-alives ligados, de todos os tenants (usado só pelo cron). */
export async function scanEnabledKeepAlive(): Promise<KeepAlive[]> {
  const items: KeepAlive[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const out = await doc.send(
      new ScanCommand({
        TableName: env.table,
        FilterExpression: "begins_with(sk, :ka) AND enabled = :on",
        ExpressionAttributeValues: { ":ka": "KA#", ":on": true },
        ExclusiveStartKey: start,
      }),
    );
    items.push(...((out.Items ?? []).map((i) => stripKeys<KeepAlive>(i))));
    start = out.LastEvaluatedKey;
  } while (start);
  return items;
}

// ---------- senhas ----------
// O Supabase não devolve a senha atual por API: o painel guarda a que conhece
// (criada, redefinida ou informada aqui), criptografada.

export type StoredPassword = { password: string; updatedAt: string; source: "created" | "reset" | "manual" };

export async function getPassword(tenant: string, ref: string): Promise<StoredPassword | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `PWD#${ref}` } }));
  return out.Item ? stripKeys<StoredPassword>(out.Item) : null;
}

export async function deletePassword(tenant: string, ref: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `PWD#${ref}` } }));
}

export async function deleteKeepAlive(tenant: string, ref: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `KA#${ref}` } }));
}

export async function putPassword(tenant: string, ref: string, sealedPassword: string, source: StoredPassword["source"]) {
  await doc.send(
    new PutCommand({
      TableName: env.table,
      Item: { pk: pk(tenant), sk: `PWD#${ref}`, password: sealedPassword, source, updatedAt: new Date().toISOString() },
    }),
  );
}

// ---------- auditoria ----------

const LOG_TTL_DAYS = 90;

export async function addLog(tenant: string, entry: Omit<LogEntry, "at">) {
  const at = new Date().toISOString();
  try {
    await doc.send(
      new PutCommand({
        TableName: env.table,
        Item: {
          pk: pk(tenant),
          sk: `LOG#${at}#${randomUUID()}`,
          at,
          ...entry,
          ttl: Math.floor(Date.now() / 1000) + LOG_TTL_DAYS * 86400,
        },
      }),
    );
  } catch (err) {
    // Auditoria é best-effort: a ação já aconteceu.
    console.error("addLog falhou", err);
  }
}

export async function listLogs(tenant: string, limit = 100): Promise<LogEntry[]> {
  return (await queryPrefix(tenant, "LOG#", { limit, newestFirst: true })).map((i) => stripKeys<LogEntry>(i));
}

// ---------- descrição dos bancos (IA ou manual) ----------
//   pk=T#<tenant>  sk=DESC#<ref>  { text, fingerprint, tables, source, updatedAt, updatedBy }

export type DbDescription = {
  ref: string;
  text: string;
  /** impressão digital do esquema quando a descrição foi revisada */
  fingerprint?: string;
  /** tabela -> colunas (para dizer o que mudou depois) */
  tables?: Record<string, string>;
  source: "ai" | "manual";
  updatedAt: string;
  updatedBy: string;
};

export async function getDescription(tenant: string, ref: string): Promise<DbDescription | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `DESC#${ref}` } }));
  return out.Item ? stripKeys<DbDescription>(out.Item) : null;
}

export async function putDescription(tenant: string, d: DbDescription) {
  await doc.send(new PutCommand({ TableName: env.table, Item: { pk: pk(tenant), sk: `DESC#${d.ref}`, ...d } }));
}

export async function deleteDescription(tenant: string, ref: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `DESC#${ref}` } }));
}

export async function listDescriptions(tenant: string): Promise<DbDescription[]> {
  return (await queryPrefix(tenant, "DESC#")).map((i) => stripKeys<DbDescription>(i));
}

/** Rascunhos de descrição já gerados para uma versão do esquema (limite de custo). */
export async function getDescribeCount(tenant: string, ref: string): Promise<{ fingerprint: string; count: number } | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: pk(tenant), sk: `DESCGEN#${ref}` } }));
  return out.Item ? { fingerprint: String(out.Item.fingerprint), count: Number(out.Item.count) || 0 } : null;
}

export async function putDescribeCount(tenant: string, ref: string, fingerprint: string, count: number) {
  await doc.send(
    new PutCommand({
      TableName: env.table,
      Item: { pk: pk(tenant), sk: `DESCGEN#${ref}`, fingerprint, count, ttl: Math.floor(Date.now() / 1000) + 90 * 86400 },
    }),
  );
}
