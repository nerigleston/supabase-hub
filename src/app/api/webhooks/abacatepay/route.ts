import type { NextRequest } from "next/server";
import { type AbacateWebhook, checkWebhookSecret, verifyWebhookSignature } from "@/lib/abacatepay";
import { addLog } from "@/lib/db";
import { getBilling, markEventSeen, tenantOfCustomer, unmarkEvent, updateBilling } from "@/lib/plans";

// Webhook do AbacatePay. Configure no painel deles com a URL
//   <APP_URL>/api/webhooks/abacatepay?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>
// e os eventos subscription.completed, subscription.renewed e subscription.cancelled.

const DAY = 86_400_000;
const GRACE_DAYS = 3; // folga para a renovação cair antes de voltar ao Grátis

function periodDays(frequency?: string) {
  switch (frequency) {
    case "ANNUALLY":
      return 366;
    case "SEMIANNUALLY":
      return 183;
    case "QUARTERLY":
      return 92;
    case "WEEKLY":
      return 7;
    default:
      return 31;
  }
}

export async function POST(request: NextRequest) {
  // 1) segredo na URL e 2) HMAC do corpo bruto. Sem os dois, 401 (o AbacatePay não reenvia 4xx).
  const raw = await request.text();
  if (!checkWebhookSecret(request.nextUrl.searchParams.get("webhookSecret"))) {
    return new Response("Não autorizado", { status: 401 });
  }
  if (!verifyWebhookSignature(raw, request.headers.get("x-webhook-signature"))) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  let event: AbacateWebhook;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  // Eventos do sandbox só valem com ABACATEPAY_ACCEPT_DEV=true (nunca dar Pro de graça em produção).
  if (event.devMode && process.env.ABACATEPAY_ACCEPT_DEV !== "true") {
    return Response.json({ ignored: "devMode" });
  }
  if (!event.event?.startsWith("subscription.")) return Response.json({ ignored: event.event });

  // Reentregas chegam com o mesmo id: processa uma vez só.
  if (!(await markEventSeen(event.id))) return Response.json({ duplicate: true });

  try {
    const customerId = event.data.customer?.id ?? event.data.checkout?.customerId;
    const tenant = (customerId && (await tenantOfCustomer(customerId))) || event.data.checkout?.externalId || null;
    if (!tenant) {
      console.error("abacatepay: evento sem tenant conhecido", event.id, event.event, customerId);
      return Response.json({ ignored: "tenant desconhecido" });
    }

    const sub = event.data.subscription;
    switch (event.event) {
      case "subscription.completed":
      case "subscription.renewed": {
        const current = await getBilling(tenant);
        // estende a partir do fim atual se ainda estiver valendo (renovação adiantada não perde dias)
        const base = Math.max(Date.now(), current.until ? new Date(current.until).getTime() : 0);
        const until = new Date(base + (periodDays(sub?.frequency) + GRACE_DAYS) * DAY).toISOString();
        await updateBilling(tenant, {
          plan: "pro",
          until,
          source: "abacatepay",
          subscriptionId: sub?.id,
          subscriptionStatus: sub?.status ?? "ACTIVE",
          cycle: sub?.frequency,
        });
        await addLog(tenant, { user: "abacatepay", action: "assinatura_paga", target: `Pro até ${until.slice(0, 10)}`, ok: true });
        break;
      }
      case "subscription.cancelled": {
        // mantém o Pro até o fim do período já pago (o `until` não muda)
        await updateBilling(tenant, { subscriptionStatus: "CANCELLED" });
        await addLog(tenant, { user: "abacatepay", action: "assinatura_cancelada", target: sub?.id ?? "?", ok: true });
        break;
      }
      case "subscription.payment_failed": {
        await addLog(tenant, { user: "abacatepay", action: "pagamento_falhou", target: sub?.id ?? "?", ok: false });
        break;
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    // libera o id e devolve 500: o AbacatePay tenta de novo mais tarde
    await unmarkEvent(event.id);
    console.error("abacatepay webhook", event.id, err);
    return new Response("Erro ao processar", { status: 500 });
  }
}
