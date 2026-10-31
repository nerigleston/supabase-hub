import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { awsClientConfig } from "./aws";
import { listConnections } from "./db";
import { env } from "./env";

// Planos do SaaS. Guardado em DynamoDB:
//   pk=T#<tenant>          sk=PLAN    { plan, until, source, customerId, subscriptionId, subscriptionStatus, cycle }
//   pk=ABACATE#<cust_id>   sk=TENANT  { tenantId }        (webhook → tenant)
//   pk=WEBHOOK#<event_id>  sk=SEEN    { ttl }             (idempotência)
// Sem item = Grátis. O Pro vem do AbacatePay (webhook) ou é ligado à mão (source "manual").
// Self-host sem FREE_ORG_LIMIT não tem limite nenhum.

export type PlanId = "free" | "pro" | "business";

/** Preços exibidos na LP. Mude aqui. */
export const PRICING = {
  pro: { monthly: 29, yearly: 290, currency: "R$" },
  business: { monthly: 39.9, yearly: 399, currency: "R$" },
};

/** Business inclui tudo do Pro. */
export const hasPro = (p: PlanId) => p === "pro" || p === "business";
/** Só o Business libera o MCP na nuvem. */
export const hasMcp = (p: PlanId) => p === "business";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Limite de organizações do plano Grátis; null = sem planos (self-host). */
export function freeOrgLimit(): number | null {
  const raw = process.env.FREE_ORG_LIMIT;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const plansEnabled = () => freeOrgLimit() !== null;

export type BillingRecord = {
  plan?: PlanId;
  /** Fim do período pago (ISO). Sem data = Pro sem vencimento (manual). */
  until?: string;
  source?: "abacatepay" | "manual";
  customerId?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  cycle?: string;
  updatedAt?: string;
};

const planKey = (tenant: string) => ({ pk: `T#${tenant}`, sk: "PLAN" });

export async function getBilling(tenant: string): Promise<BillingRecord> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: planKey(tenant) }));
  return (out.Item as BillingRecord | undefined) ?? {};
}

export async function getPlan(tenant: string): Promise<PlanId> {
  if (!plansEnabled()) return "business"; // self-host: tudo liberado
  const b = await getBilling(tenant);
  if (!b.plan || b.plan === "free") return "free";
  // período pago vencido volta para o Grátis
  const active = !b.until || new Date(b.until).getTime() >= Date.now();
  return active ? b.plan : "free";
}

/** Grava campos do registro de cobrança (merge). */
export async function updateBilling(tenant: string, fields: BillingRecord) {
  const entries = Object.entries({ ...fields, updatedAt: new Date().toISOString() }).filter(([, v]) => v !== undefined);
  await doc.send(
    new UpdateCommand({
      TableName: env.table,
      Key: planKey(tenant),
      UpdateExpression: `SET ${entries.map((_, i) => `#k${i} = :v${i}`).join(", ")}`,
      ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k])),
      ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])),
    }),
  );
}

/** Liga o cliente do AbacatePay ao tenant (o webhook só traz o cliente). */
export async function linkCustomer(tenant: string, customerId: string) {
  await Promise.all([
    doc.send(new PutCommand({ TableName: env.table, Item: { pk: `ABACATE#${customerId}`, sk: "TENANT", tenantId: tenant } })),
    updateBilling(tenant, { customerId }),
  ]);
}

export async function tenantOfCustomer(customerId: string): Promise<string | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: `ABACATE#${customerId}`, sk: "TENANT" } }));
  return (out.Item?.tenantId as string | undefined) ?? null;
}

/** true na primeira vez que o evento aparece; false se já foi processado (reentrega). */
export async function markEventSeen(eventId: string): Promise<boolean> {
  try {
    await doc.send(
      new PutCommand({
        TableName: env.table,
        Item: { pk: `WEBHOOK#${eventId}`, sk: "SEEN", ttl: Math.floor(Date.now() / 1000) + 30 * 86400 },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/** Se o processamento falhar, libera o evento para a reentrega tentar de novo. */
export async function unmarkEvent(eventId: string) {
  await doc.send(new DeleteCommand({ TableName: env.table, Key: { pk: `WEBHOOK#${eventId}`, sk: "SEEN" } })).catch(() => {});
}

export type OrgUsage = { plan: PlanId; used: number; limit: number | null };

/** Quantas organizações o tenant tem e quantas o plano permite (null = sem limite). */
export async function orgUsage(tenant: string): Promise<OrgUsage> {
  const [plan, conns] = await Promise.all([getPlan(tenant), listConnections(tenant)]);
  return { plan, used: conns.length, limit: plan === "free" ? freeOrgLimit() : null };
}

/**
 * Vagas para organizações NOVAS. Um objeto compartilhado entre conexões feitas
 * em paralelo (várias orgs de um login, vários logins): `take()` decrementa
 * antes de qualquer await, então duas orgs não pegam a mesma vaga.
 */
export type OrgBudget = { take(): boolean; readonly blocked: string[]; block(name: string): void };

export async function orgBudget(tenant: string): Promise<OrgBudget> {
  const { used, limit } = await orgUsage(tenant);
  let left = limit === null ? Infinity : Math.max(0, limit - used);
  const blocked: string[] = [];
  return {
    take() {
      if (left <= 0) return false;
      left -= 1;
      return true;
    },
    blocked,
    block(name) {
      blocked.push(name);
    },
  };
}
