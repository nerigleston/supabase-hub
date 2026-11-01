import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { awsClientConfig } from "./aws";
import { env } from "./env";

// Índice e-mail -> conta do BaseHub, gravado a cada login:
//   pk=USER#<email>  sk=META  { sub, tenantId, email, lastLoginAt }
// Serve para só convidar quem já tem conta, sem precisar de permissão de admin no Cognito.

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});

export async function rememberUser(u: { email: string; sub: string; tenantId: string }) {
  const email = u.email.trim().toLowerCase();
  if (!email) return;
  await doc.send(
    new PutCommand({
      TableName: env.table,
      Item: { pk: `USER#${email}`, sk: "META", email, sub: u.sub, tenantId: u.tenantId, lastLoginAt: new Date().toISOString() },
    }),
  );
}

export async function findUser(emailRaw: string): Promise<{ email: string; sub: string; tenantId: string } | null> {
  const email = emailRaw.trim().toLowerCase();
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: `USER#${email}`, sk: "META" } }));
  return out.Item ? { email, sub: String(out.Item.sub), tenantId: String(out.Item.tenantId) } : null;
}
