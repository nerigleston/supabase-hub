import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Cliente mínimo da API v2 do AbacatePay (https://docs.abacatepay.com).
// O ambiente (sandbox ou produção) é definido pela chave, não pela URL.

const BASE = "https://api.abacatepay.com/v2";

// Chave pública documentada pelo AbacatePay para validar o HMAC dos webhooks.
const WEBHOOK_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

export type BillingCycle = "monthly" | "yearly";
export type PaidPlan = "pro" | "business";

// Um produto por plano e período (a AbacatePay salva um período por produto).
const PRODUCT_ENV: Record<PaidPlan, Record<BillingCycle, string>> = {
  pro: { monthly: "ABACATEPAY_PRODUCT_MONTHLY", yearly: "ABACATEPAY_PRODUCT_YEARLY" },
  business: { monthly: "ABACATEPAY_PRODUCT_BUSINESS_MONTHLY", yearly: "ABACATEPAY_PRODUCT_BUSINESS_YEARLY" },
};

export const abacate = {
  /** Pagamento liberado: exige PAYMENTS_ENABLED=true além das credenciais (sandbox nunca abre sozinho). */
  get configured() {
    return Boolean(
      process.env.PAYMENTS_ENABLED === "true" &&
        process.env.ABACATEPAY_API_KEY &&
        process.env.ABACATEPAY_WEBHOOK_SECRET &&
        abacate.product("pro", "monthly"),
    );
  },
  product(plan: PaidPlan, cycle: BillingCycle): string | null {
    return process.env[PRODUCT_ENV[plan][cycle]] || null;
  },
};

export class AbacateError extends Error {}

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) throw new AbacateError("ABACATEPAY_API_KEY ausente");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { data?: T; success?: boolean; error?: unknown } | null;
  if (!res.ok || !json?.success || !json.data) {
    throw new AbacateError(`AbacatePay ${path}: ${res.status} ${JSON.stringify(json?.error ?? json)}`);
  }
  return json.data;
}

export function createCustomer(input: { email: string; tenantId: string }) {
  // v2: corpo plano (sem `data`); metadata só aceita valores texto
  return call<{ id: string }>("/customers/create", { email: input.email, metadata: { tenantId: input.tenantId } });
}

type Method = "PIX" | "CARD";

export async function createSubscriptionCheckout(input: {
  productId: string;
  customerId: string;
  tenantId: string;
  returnUrl: string;
  completionUrl: string;
}) {
  const create = (methods: Method[]) =>
    call<{ id: string; url: string }>("/subscriptions/create", {
      items: [{ id: input.productId, quantity: 1 }],
      customerId: input.customerId,
      externalId: input.tenantId,
      returnUrl: input.returnUrl,
      completionUrl: input.completionUrl,
      methods,
      metadata: { tenantId: input.tenantId },
    });
  try {
    return await create(["PIX", "CARD"]);
  } catch (err) {
    // a loja pode ainda não ter um dos meios liberado ("CARD is not available for this store")
    const msg = err instanceof Error ? err.message : "";
    if (/CARD is not available/i.test(msg)) return create(["PIX"]);
    if (/PIX is not available/i.test(msg)) return create(["CARD"]);
    throw err;
  }
}

export function cancelSubscription(id: string) {
  return call<{ id: string; status: string }>("/subscriptions/cancel", { id });
}

/** Confere o X-Webhook-Signature (HMAC-SHA256 do corpo bruto, base64). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", WEBHOOK_PUBLIC_KEY).update(Buffer.from(rawBody, "utf8")).digest("base64"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** Compara o segredo da URL em tempo constante. */
export function checkWebhookSecret(received: string | null): boolean {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (!secret || !received) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type AbacateWebhook = {
  id: string;
  event: string;
  devMode: boolean;
  data: {
    subscription?: { id: string; status: string; frequency?: string; amount?: number; checkoutId?: string; customerId?: string };
    customer?: { id: string; email?: string };
    checkout?: { id?: string; externalId?: string | null; customerId?: string };
  };
};
