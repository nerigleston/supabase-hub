import { requireSession } from "@/lib/session";
import type { Metadata } from "next";
import Link from "next/link";
import { NewProjectForm } from "@/components/new-project-form";
import { buttonClass, EmptyState, PageHeader } from "@/components/app-ui";
import { loadHub } from "@/lib/hub";

export const metadata: Metadata = { title: "Novo banco" };

export default async function NovoPage({ searchParams }: PageProps<"/novo">) {
  const sp = await searchParams;
  const session = await requireSession();
  const { accounts } = await loadHub(session.tenantId);

  return (
    <>
      <PageHeader
        title="Novo banco"
        description="Cria um projeto Supabase onde houver espaço. No plano grátis, cada e-mail do Supabase pode ter 2 bancos ligados ao mesmo tempo, somando todas as organizações dele."
      />
      {accounts.length === 0 ? (
        <EmptyState title="Conecte uma conta primeiro" action={<Link href="/contas" className={buttonClass("primary")}>Ir para Contas</Link>}>
          O projeto é criado dentro de uma organização conectada.
        </EmptyState>
      ) : (
        <NewProjectForm
          defaultOrg={typeof sp.org === "string" ? sp.org : undefined}
          accounts={accounts.map((a) => ({ slug: a.orgSlug, name: a.name, login: a.login, freeSlots: a.freeSlots, ok: !a.error }))}
        />
      )}
    </>
  );
}
