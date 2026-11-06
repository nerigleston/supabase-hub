import type { Metadata } from "next";
import Link from "next/link";
import { ContactList, LegalPage } from "@/components/legal-page";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de Uso do BaseHub, painel para gerenciar contas e organizações do Supabase.",
};

export default function TermosPage() {
  const { company, cnpj } = env.contact;
  const owner = company ? `${company}${cnpj ? `, CNPJ ${cnpj}` : ""}` : "o responsável pelo BaseHub";
  return (
    <LegalPage title="Termos de Uso" updated="6 de novembro de 2026">
      <h2>1. Quem somos</h2>
      <p>
        O BaseHub (basehub.nerifilho.com.br) é um painel para gerenciar várias contas e organizações do Supabase em um
        só lugar. O serviço é oferecido por {owner}. Ao criar uma conta ou usar o serviço, você concorda com estes
        termos.
      </p>
      <p>
        O BaseHub é um projeto independente, sem vínculo com a Supabase Inc. &quot;Supabase&quot; é marca registrada da
        Supabase Inc.
      </p>

      <h2>2. Conta</h2>
      <ul>
        <li>Você precisa informar um e-mail válido e manter sua senha em sigilo.</li>
        <li>Você responde pelo que for feito na sua conta, inclusive por pessoas que você convidar para seus bancos.</li>
        <li>Só conecte contas e organizações do Supabase que você tem autorização para administrar.</li>
      </ul>

      <h2>3. O que o serviço faz com o seu Supabase</h2>
      <p>
        O BaseHub age em seu nome pela API oficial do Supabase (OAuth ou Access Token que você fornece): lista
        organizações e projetos, cria, pausa, restaura e exclui bancos, roda SQL e mostra dados de conexão, sempre a
        partir de um comando seu ou de um assistente que você autorizou (MCP). Ações destrutivas pedem confirmação.
      </p>
      <p>
        Tokens e senhas ficam criptografados (AES-256-GCM). Você pode desconectar uma conta a qualquer momento, e o token
        guardado é apagado.
      </p>

      <h2>4. Planos e pagamento</h2>
      <p>
        Há um plano Grátis e planos pagos (Pro e Business), cobrados como <strong>assinatura recorrente</strong> mensal ou
        anual, por Pix ou cartão via AbacatePay. Os preços atuais estão na página inicial. Mudanças de preço valem só a
        partir da renovação seguinte e são avisadas antes por e-mail.
      </p>
      <p>
        Cancelamento, direito de arrependimento de 7 dias e reembolso seguem a{" "}
        <Link href="/reembolso">Política de Cancelamento e Reembolso</Link>.
      </p>

      <h2>5. Uso permitido</h2>
      <p>Não é permitido usar o BaseHub para:</p>
      <ul>
        <li>acessar contas ou bancos de terceiros sem autorização;</li>
        <li>violar os termos do Supabase ou a lei brasileira;</li>
        <li>tentar burlar limites, permissões ou a segurança do serviço;</li>
        <li>revender o acesso sem acordo prévio.</li>
      </ul>
      <p>Contas que descumprirem estas regras podem ser suspensas, com aviso por e-mail sempre que possível.</p>

      <h2>6. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o serviço no ar, mas ele depende do Supabase e de outros fornecedores e pode ter
        interrupções. O BaseHub não guarda cópia dos seus bancos: backups continuam sendo responsabilidade sua e do seu
        plano no Supabase. Não respondemos por perdas causadas por comandos executados por você, por pessoas que você
        convidou ou por assistentes que você conectou.
      </p>

      <h2>7. Privacidade</h2>
      <p>
        Guardamos o mínimo para o serviço funcionar: e-mail da conta, conexões com o Supabase (criptografadas),
        configurações e o registro de atividade. Não vendemos dados. Recursos de IA são opcionais; quando usados, segredos
        são mascarados antes do envio. Você pode pedir a exclusão da sua conta e dos seus dados pelos contatos abaixo, nos
        termos da LGPD.
      </p>

      <h2>8. Código aberto</h2>
      <p>
        O código do BaseHub é aberto (licença AGPL-3.0). Quem hospeda a própria cópia é responsável por ela; estes termos
        valem para o serviço em basehub.nerifilho.com.br.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Podemos atualizar estes termos. A data no topo indica a versão atual, e mudanças relevantes são avisadas por
        e-mail.
      </p>

      <h2>10. Contato e foro</h2>
      <ContactList />
      <p>Estes termos seguem a lei brasileira, incluindo o Código de Defesa do Consumidor.</p>
    </LegalPage>
  );
}
