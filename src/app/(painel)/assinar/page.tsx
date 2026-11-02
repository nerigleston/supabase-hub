import { Check } from "lucide-react";
import type { Metadata } from "next";
import { cancelSubscriptionAction } from "@/app/actions";
import { buttonClass, Card, Notice, PageHeader } from "@/components/app-ui";
import { ConfirmAction } from "@/components/confirm-action";
import { abacate } from "@/lib/abacatepay";
import { getBilling, orgUsage, PRICING } from "@/lib/plans";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Plano" };

const ERRORS: Record<string, string> = {
  nao_configurado: "Os pagamentos ainda não estão configurados neste servidor.",
  ja_assinante: "Você já tem uma assinatura ativa.",
  muitas_tentativas: "Muitas tentativas seguidas. Aguarde alguns minutos.",
  falha: "Não foi possível abrir o pagamento agora. Tente de novo em instantes.",
};

const brl = (n: number) => n.toLocaleString("pt-BR");
const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

export default async function AssinarPage({ searchParams }: PageProps<"/assinar">) {
  const sp = await searchParams;
  const session = await requireSession();
  const [usage, billing] = await Promise.all([orgUsage(session.tenantId), getBilling(session.tenantId)]);
  const paid = usage.plan !== "free";
  const planName = usage.plan === "business" ? "Business" : usage.plan === "pro" ? "Pro" : "Grátis";
  const active = billing.subscriptionStatus === "ACTIVE";
  const canPay = abacate.configured;
  const error = typeof sp.erro === "string" ? ERRORS[sp.erro] : undefined;
  const PLANS = [
    {
      id: "pro" as const,
      title: "Pro",
      features: ["Organizações ilimitadas", "Compartilhar bancos com outras contas", "Tudo do Grátis"],
    },
    {
      id: "business" as const,
      title: "Business",
      features: ["Tudo do Pro", "MCP na nuvem (Claude, ChatGPT, Cursor, Codex)", "Permissões do MCP por banco"],
    },
  ].map((p) => ({
    ...p,
    price: PRICING[p.id],
    monthly: Boolean(abacate.product(p.id, "monthly")),
    yearly: Boolean(abacate.product(p.id, "yearly")),
  }));

  return (
    <>
      <PageHeader title="Plano" description="Grátis para até 2 organizações Supabase. No Pro, ilimitado." />
      <div className="flex max-w-3xl flex-col gap-4">
        {error && <Notice tone="error" title="Pagamento não iniciado">{error}</Notice>}
        {sp.pago && !paid && (
          <Notice tone="info" title="Pagamento recebido, confirmando…">
            O AbacatePay avisa o BaseHub em alguns segundos (no Pix, assim que o banco confirmar). Atualize a página em instantes.
          </Notice>
        )}
        {sp.pago && paid && <Notice tone="ok" title={`Bem-vindo ao ${planName}!`}>Seu plano já está liberado.</Notice>}

        <Card className="p-5">
          <p className="text-sm text-zinc-500">Seu plano</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{planName}</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {usage.limit === null ? `${usage.used} organização(ões) conectada(s), sem limite.` : `${usage.used} de ${usage.limit} organizações em uso.`}
          </p>
          {paid && billing.until && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {active ? "Renova automaticamente. Período atual até " : `Assinatura cancelada. O ${planName} vale até `}
              <strong>{date(billing.until)}</strong>.
            </p>
          )}
          {paid && active && billing.subscriptionId && (
            <div className="mt-4">
              <ConfirmAction
                label="Cancelar assinatura"
                variant="ghost"
                confirm={{
                  title: `Cancelar a assinatura do ${planName}?`,
                  body: (
                    <>
                      Não haverá novas cobranças. O {planName} continua até <strong>{date(billing.until)}</strong>; depois disso a conta volta para o
                      Grátis. Nenhuma organização é desconectada, mas só dá para conectar novas dentro do limite.
                    </>
                  ),
                  confirmLabel: "Cancelar assinatura",
                  danger: true,
                }}
                action={cancelSubscriptionAction}
              />
            </div>
          )}
        </Card>

        {!(paid && active) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {PLANS.map((p) => (
              <Card key={p.id} className={`flex flex-col p-5 ${p.id === "business" ? "border-emerald-600 dark:border-emerald-600" : ""}`}>
                <h2 className="font-semibold">{p.title}</h2>
                <p className="mt-3">
                  <span className="text-3xl font-semibold tracking-tight">
                    {p.price.currency} {brl(p.price.monthly)}
                  </span>
                  <span className="text-zinc-500">/mês</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  ou {p.price.currency} {brl(p.price.yearly)}/ano (2 meses grátis). Pix ou cartão, cancele quando quiser.
                </p>
                <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                  {p.features.map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="size-4 shrink-0 text-emerald-600" /> {t}
                    </li>
                  ))}
                </ul>
                {canPay && p.monthly ? (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <form action="/api/billing/checkout" method="post">
                      <input type="hidden" name="plano" value={p.id} />
                      <input type="hidden" name="ciclo" value="monthly" />
                      <button className={buttonClass("secondary", "h-10 w-full")}>Mensal</button>
                    </form>
                    {p.yearly && (
                      <form action="/api/billing/checkout" method="post">
                        <input type="hidden" name="plano" value={p.id} />
                        <input type="hidden" name="ciclo" value="yearly" />
                        <button className={buttonClass("primary", "h-10 w-full")}>Anual</button>
                      </form>
                    )}
                  </div>
                ) : (
                  <button type="button" disabled className={buttonClass("secondary", "mt-5 h-10 w-full")}>Em breve</button>
                )}
              </Card>
            ))}
          </div>
        )}
        {!canPay && !paid && (
          <Notice tone="info" title="O plano Pro chega em breve">
            Por enquanto todas as contas usam o Grátis, com até {usage.limit ?? 2} organizações. Quando o pagamento abrir, é só voltar aqui e assinar.
          </Notice>
        )}
        <p className="text-xs text-zinc-500">Pagamento processado pelo AbacatePay. O BaseHub não vê nem guarda dados do seu cartão.</p>
      </div>
    </>
  );
}
