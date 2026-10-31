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
  const pro = usage.plan === "pro";
  const active = billing.subscriptionStatus === "ACTIVE";
  const canPay = abacate.configured;
  const yearly = Boolean(abacate.product("yearly"));
  const error = typeof sp.erro === "string" ? ERRORS[sp.erro] : undefined;
  const { monthly, yearly: yearPrice, currency } = PRICING.pro;

  return (
    <>
      <PageHeader title="Plano" description="Grátis para até 2 organizações Supabase. No Pro, ilimitado." />
      <div className="flex max-w-3xl flex-col gap-4">
        {error && <Notice tone="error" title="Pagamento não iniciado">{error}</Notice>}
        {sp.pago && !pro && (
          <Notice tone="info" title="Pagamento recebido, confirmando…">
            O AbacatePay avisa o BaseHub em alguns segundos (no Pix, assim que o banco confirmar). Atualize a página em instantes.
          </Notice>
        )}
        {sp.pago && pro && <Notice tone="ok" title="Bem-vindo ao Pro!">Organizações ilimitadas liberadas.</Notice>}

        <Card className="p-5">
          <p className="text-sm text-zinc-500">Seu plano</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{pro ? "Pro" : "Grátis"}</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {usage.limit === null ? `${usage.used} organização(ões) conectada(s), sem limite.` : `${usage.used} de ${usage.limit} organizações em uso.`}
          </p>
          {pro && billing.until && (
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {active ? "Renova automaticamente. Período atual até " : "Assinatura cancelada. O Pro vale até "}
              <strong>{date(billing.until)}</strong>.
            </p>
          )}
          {pro && active && billing.subscriptionId && (
            <div className="mt-4">
              <ConfirmAction
                label="Cancelar assinatura"
                variant="ghost"
                confirm={{
                  title: "Cancelar a assinatura do Pro?",
                  body: (
                    <>
                      Não haverá novas cobranças. O Pro continua até <strong>{date(billing.until)}</strong>; depois disso a conta volta para o
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

        {!(pro && active) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { cycle: "monthly", title: "Pro mensal", price: `${currency} ${brl(monthly)}`, per: "/mês", note: "Cancele quando quiser.", show: true },
              {
                cycle: "yearly",
                title: "Pro anual",
                price: `${currency} ${brl(yearPrice)}`,
                per: "/ano",
                note: `Equivale a ${currency} ${brl(Math.round((yearPrice / 12) * 100) / 100)}/mês: 2 meses grátis.`,
                show: yearly,
              },
            ]
              .filter((p) => p.show)
              .map((p) => (
                <Card key={p.cycle} className={`flex flex-col p-5 ${p.cycle === "yearly" ? "border-emerald-600 dark:border-emerald-600" : ""}`}>
                  <h2 className="font-semibold">{p.title}</h2>
                  <p className="mt-3">
                    <span className="text-3xl font-semibold tracking-tight">{p.price}</span>
                    <span className="text-zinc-500">{p.per}</span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">{p.note}</p>
                  <ul className="mt-4 flex flex-col gap-1.5 text-sm">
                    {["Organizações ilimitadas", "Pix ou cartão", "Tudo do Grátis"].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-600" /> {t}
                      </li>
                    ))}
                  </ul>
                  {canPay ? (
                    <form action="/api/billing/checkout" method="post" className="mt-5">
                      <input type="hidden" name="ciclo" value={p.cycle} />
                      <button className={buttonClass(p.cycle === "yearly" ? "primary" : "secondary", "h-10 w-full")}>
                        Assinar {p.cycle === "yearly" ? "anual" : "mensal"}
                      </button>
                    </form>
                  ) : (
                    <button type="button" disabled className={buttonClass("secondary", "mt-5 h-10 w-full")}>Em breve</button>
                  )}
                </Card>
              ))}
          </div>
        )}
        {!canPay && !pro && (
          <Notice tone="info" title="O plano Pro chega em breve">
            Por enquanto todas as contas usam o Grátis, com até {usage.limit ?? 2} organizações. Quando o pagamento abrir, é só voltar aqui e assinar.
          </Notice>
        )}
        <p className="text-xs text-zinc-500">Pagamento processado pelo AbacatePay. O BaseHub não vê nem guarda dados do seu cartão.</p>
      </div>
    </>
  );
}
