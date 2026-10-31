import { type NextRequest, NextResponse } from "next/server";
import { abacate, type BillingCycle, createCustomer, createSubscriptionCheckout } from "@/lib/abacatepay";
import { addLog } from "@/lib/db";
import { env } from "@/lib/env";
import { getBilling, getPlan, linkCustomer } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";

// 303: depois de um POST o navegador segue com GET (307 repetiria o POST no destino).
const go = (to: string) => NextResponse.redirect(new URL(to, env.appUrl), 303);

// Formulário "Assinar" (POST) → cria o checkout de assinatura no AbacatePay e redireciona para ele.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return go("/login?next=/assinar");
  if (!abacate.configured) return go("/assinar?erro=nao_configurado");

  const form = await request.formData();
  const cycle: BillingCycle = form.get("ciclo") === "yearly" ? "yearly" : "monthly";
  const productId = abacate.product(cycle);
  if (!productId) return go("/assinar?erro=nao_configurado");

  if ((await getPlan(session.tenantId)) === "pro") {
    const b = await getBilling(session.tenantId);
    if (b.subscriptionStatus === "ACTIVE") return go("/assinar?erro=ja_assinante");
  }

  const rl = await rateLimit(session.tenantId, "checkout", 5, 300);
  if (!rl.ok) return go("/assinar?erro=muitas_tentativas");

  let url: string;
  try {
    let customerId = (await getBilling(session.tenantId)).customerId;
    if (!customerId) {
      customerId = (await createCustomer({ email: session.email, tenantId: session.tenantId })).id;
      await linkCustomer(session.tenantId, customerId);
    }
    const checkout = await createSubscriptionCheckout({
      productId,
      customerId,
      tenantId: session.tenantId,
      returnUrl: `${env.appUrl}/assinar`,
      completionUrl: `${env.appUrl}/assinar?pago=1`,
    });
    url = checkout.url;
    await addLog(session.tenantId, { user: session.email, action: "checkout_iniciado", target: cycle === "yearly" ? "Pro anual" : "Pro mensal", ok: true });
  } catch (err) {
    console.error("checkout abacatepay", err);
    await addLog(session.tenantId, { user: session.email, action: "checkout_iniciado", target: cycle, ok: false, detail: String(err) });
    return go("/assinar?erro=falha");
  }
  return go(url);
}
