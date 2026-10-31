import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createHash, randomBytes } from "node:crypto";
import { awsClientConfig } from "./aws";
import { env } from "./env";

// Authorization Server OAuth 2.1 (PKCE) para o MCP. Guardado em DynamoDB:
//   pk=OAUTHCLIENT#<id>   sk=META   { redirectUris, name, createdAt }
//   pk=OAUTHCODE#<code>   sk=META   { ...code, ttl }      (5 min)
//   pk=OAUTHTOK#<hash>    sk=META   { tenantId, email, scope, ttl }   (1 h)
//   pk=OAUTHREF#<hash>    sk=META   { tenantId, email, scope, ttl }   (30 d)
// Tokens são opacos: guardamos só o sha256, então dá para revogar e nada vaza.

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});

const ACCESS_TTL = 3600; // 1 h
const REFRESH_TTL = 30 * 86400; // 30 d
const CODE_TTL = 300; // 5 min

const rand = (bytes = 32) => randomBytes(bytes).toString("base64url");
const sha = (s: string) => createHash("sha256").update(s).digest("base64url");
const nowSec = () => Math.floor(Date.now() / 1000);

export type OAuthClient = { clientId: string; redirectUris: string[]; name?: string };

export async function registerClient(redirectUris: string[], name?: string): Promise<OAuthClient> {
  const clientId = `mcp_${rand(16)}`;
  await doc.send(
    new PutCommand({
      TableName: env.table,
      Item: { pk: `OAUTHCLIENT#${clientId}`, sk: "META", clientId, redirectUris, name, createdAt: new Date().toISOString() },
    }),
  );
  return { clientId, redirectUris, name };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: `OAUTHCLIENT#${clientId}`, sk: "META" } }));
  return out.Item ? { clientId, redirectUris: out.Item.redirectUris, name: out.Item.name } : null;
}

type CodePayload = {
  clientId: string;
  redirectUri: string;
  tenantId: string;
  email: string;
  codeChallenge: string;
  scope: string;
  resource?: string;
};

export async function createAuthCode(p: CodePayload): Promise<string> {
  const code = rand(24);
  await doc.send(
    new PutCommand({
      TableName: env.table,
      Item: { pk: `OAUTHCODE#${code}`, sk: "META", ...p, ttl: nowSec() + CODE_TTL },
    }),
  );
  return code;
}

/** Troca o código por tokens, validando PKCE, client e redirect. Código é uso único. */
export async function consumeAuthCode(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
): Promise<{ tenantId: string; email: string; scope: string } | null> {
  const key = { pk: `OAUTHCODE#${code}`, sk: "META" };
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: key }));
  const item = out.Item as (CodePayload & { ttl: number }) | undefined;
  if (!item) return null;
  await doc.send(new DeleteCommand({ TableName: env.table, Key: key })); // uso único
  if (item.ttl < nowSec()) return null;
  if (item.clientId !== clientId || item.redirectUri !== redirectUri) return null;
  if (sha(codeVerifier) !== item.codeChallenge) return null; // PKCE S256
  return { tenantId: item.tenantId, email: item.email, scope: item.scope };
}

export type TokenSet = { access_token: string; refresh_token: string; expires_in: number; token_type: "Bearer"; scope: string };

export async function issueTokens(tenantId: string, email: string, scope: string): Promise<TokenSet> {
  const access = rand(32);
  const refresh = rand(32);
  await Promise.all([
    doc.send(
      new PutCommand({
        TableName: env.table,
        Item: { pk: `OAUTHTOK#${sha(access)}`, sk: "META", tenantId, email, scope, ttl: nowSec() + ACCESS_TTL },
      }),
    ),
    doc.send(
      new PutCommand({
        TableName: env.table,
        Item: { pk: `OAUTHREF#${sha(refresh)}`, sk: "META", tenantId, email, scope, ttl: nowSec() + REFRESH_TTL },
      }),
    ),
  ]);
  return { access_token: access, refresh_token: refresh, expires_in: ACCESS_TTL, token_type: "Bearer", scope };
}

/** Valida um access token (usado pela API /api/mcp). */
export async function validateAccessToken(token: string): Promise<{ tenantId: string; email: string; scope: string } | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: `OAUTHTOK#${sha(token)}`, sk: "META" } }));
  const item = out.Item as { tenantId: string; email: string; scope: string; ttl: number } | undefined;
  if (!item || item.ttl < nowSec()) return null;
  return { tenantId: item.tenantId, email: item.email, scope: item.scope };
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet | null> {
  const key = { pk: `OAUTHREF#${sha(refreshToken)}`, sk: "META" };
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: key }));
  const item = out.Item as { tenantId: string; email: string; scope: string; ttl: number } | undefined;
  if (!item || item.ttl < nowSec()) return null;
  await doc.send(new DeleteCommand({ TableName: env.table, Key: key })); // rotaciona
  return issueTokens(item.tenantId, item.email, item.scope);
}
