import type { Metadata } from "next";
import Link from "next/link";
import { ContactList, LegalPage } from "@/components/legal-page";
import { PRICING } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Cancelamento e reembolso",
  description: "Como cancelar a assinatura do BaseHub e pedir reembolso, incluindo o direito de arrependimento de 7 dias.",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

export default function ReembolsoPage() {
  return (
    <LegalPage title="Política de Cancelamento e Reembolso" updated="6 de novembro de 2026">
      <h2>1. Como é a cobrança</h2>
      <p>
        Os planos pagos do BaseHub são <strong>assinaturas recorrentes</strong>, renovadas automaticamente até você
        cancelar. Você escolhe o período na hora de assinar:
      </p>
      <ul>
        <li>Pro: R$ {brl(PRICING.pro.monthly)} por mês ou R$ {brl(PRICING.pro.yearly)} por ano.</li>
        <li>Business: R$ {brl(PRICING.business.monthly)} por mês ou R$ {brl(PRICING.business.yearly)} por ano.</li>
      </ul>
      <p>
        O pagamento é feito por Pix ou cartão, processado pela AbacatePay. O plano Grátis não tem cobrança.
      </p>

      <h2>2. Direito de arrependimento (7 dias)</h2>
      <p>
        Pelo art. 49 do Código de Defesa do Consumidor, você pode desistir da assinatura em até{" "}
        <strong>7 dias corridos</strong> contados do primeiro pagamento. Nesse caso devolvemos{" "}
        <strong>100% do valor pago</strong>, sem precisar justificar o motivo.
      </p>
      <p>
        Vale para a primeira contratação de cada plano, mensal ou anual. Renovações automáticas não reabrem o prazo.
      </p>

      <h2>3. Cancelamento depois dos 7 dias</h2>
      <p>
        Você pode cancelar quando quiser, sem multa e sem fidelidade, na página{" "}
        <Link href="/assinar">Plano</Link> do painel. O cancelamento interrompe as próximas cobranças. O plano pago
        continua ativo até o fim do período que já foi pago e depois a conta volta para o plano Grátis.
      </p>
      <p>
        Fora do prazo de arrependimento não há devolução proporcional do período em andamento, inclusive no plano anual.
        Seus dados e conexões continuam na conta; só os recursos exclusivos do plano pago deixam de funcionar.
      </p>

      <h2>4. Cobranças indevidas</h2>
      <p>
        Se houver cobrança em duplicidade, cobrança depois de um cancelamento confirmado ou falha nossa que impeça o uso
        do serviço, devolvemos o valor cobrado a mais, em qualquer momento.
      </p>

      <h2>5. Como pedir o reembolso</h2>
      <p>Envie o e-mail da sua conta no BaseHub e o motivo do pedido (opcional no arrependimento) por:</p>
      <ContactList />
      <p>
        Respondemos em até 2 dias úteis. O estorno é solicitado em até 5 dias úteis depois da confirmação, pelo mesmo
        meio do pagamento: no Pix o valor volta para a conta de origem; no cartão, o crédito aparece em até duas faturas,
        conforme o prazo do emissor. Ao confirmar o reembolso, a assinatura é cancelada e a conta volta para o plano
        Grátis.
      </p>

      <h2>6. Mais informações</h2>
      <p>
        As demais regras de uso do serviço estão nos <Link href="/termos">Termos de Uso</Link>.
      </p>
    </LegalPage>
  );
}
