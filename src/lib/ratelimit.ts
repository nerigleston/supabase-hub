import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { awsClientConfig } from "./aws";
import { env } from "./env";

// Rate limit por tenant+ação, janela fixa. Guardado em DynamoDB:
//   pk=T#<tenant>  sk=RL#<action>  { windowStart, count, ttl }
// Fail-open: se o DynamoDB falhar, não bloqueia (não dá para o usuário se trancar
// fora por uma falha de infra). O cooldown do "Pingar agora" continua à parte.

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});

export type RateLimit = { ok: true } | { ok: false; retryAfterSec: number };

export async function rateLimit(tenant: string, action: string, limit: number, windowSec: number): Promise<RateLimit> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const Key = { pk: `T#${tenant}`, sk: `RL#${action}` };
  try {
    const { Item } = await doc.send(new GetCommand({ TableName: env.table, Key }));
    if (!Item || now - Number(Item.windowStart) >= windowMs) {
      await doc.send(
        new PutCommand({
          TableName: env.table,
          Item: { ...Key, windowStart: now, count: 1, ttl: Math.floor(now / 1000) + windowSec + 60 },
        }),
      );
      return { ok: true };
    }
    if (Number(Item.count) >= limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((Number(Item.windowStart) + windowMs - now) / 1000)) };
    }
    await doc.send(
      new UpdateCommand({
        TableName: env.table,
        Key,
        UpdateExpression: "ADD #c :one",
        ConditionExpression: "#c < :limit",
        ExpressionAttributeNames: { "#c": "count" },
        ExpressionAttributeValues: { ":one": 1, ":limit": limit },
      }),
    );
    return { ok: true };
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") {
      return { ok: false, retryAfterSec: windowSec };
    }
    console.error("rateLimit falhou (fail-open)", err);
    return { ok: true };
  }
}

export function tooMany(retryAfterSec: number) {
  const m = Math.ceil(retryAfterSec / 60);
  const quando = retryAfterSec < 60 ? `${retryAfterSec}s` : `${m} min`;
  return { ok: false as const, message: `Muitas ações em pouco tempo. Tente de novo em ${quando}.` };
}
