import type { Metadata } from "next";
import Link from "next/link";
import { McpConnect } from "@/components/mcp-connect";
import { McpSettings } from "@/components/mcp-settings";
import { buttonClass, Notice, PageHeader } from "@/components/app-ui";
import { env } from "@/lib/env";
import { loadHub } from "@/lib/hub";
import { CATALOG, getMcpConfig } from "@/lib/mcp";
import { hasMcp, orgUsage } from "@/lib/plans";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "MCP" };

export default async function McpPage() {
  const session = await requireSession();
  const [usage, cfg] = await Promise.all([orgUsage(session.tenantId), getMcpConfig(session.tenantId)]);

  if (!hasMcp(usage.plan)) {
    return (
      <>
        <PageHeader title="MCP na nuvem" description="Controle seus bancos Supabase pelo Claude, Cursor ou Claude Code." />
        <Notice
          tone="info"
          title="Disponível no plano Business"
          action={<Link href="/assinar" className={buttonClass("primary")}>Ver o Business</Link>}
        >
          O MCP deixa um assistente (com seu login do BaseHub) executar só as ações que você liberar, nos bancos que você escolher. Seu plano
          atual é o {usage.plan}.
        </Notice>
      </>
    );
  }

  const { projects } = await loadHub(session.tenantId);

  return (
    <>
      <PageHeader
        title="MCP na nuvem"
        description="Adicione o servidor no seu assistente e escolha o que ele pode fazer. Feito com a Jangada."
      />
      <div className="flex flex-col gap-6">
        <McpConnect mcpUrl={env.mcpUrl} />
        <McpSettings
          catalog={CATALOG.map((t) => ({
            name: t.name,
            description: t.description,
            group: t.group,
            destructive: t.destructive,
            perDb: !!t.permissionOnly || "project_ref" in t.inputSchema.properties,
          }))}
          config={cfg}
          projects={projects.map((p) => ({ ref: p.ref, name: p.name, account: p.account }))}
        />
      </div>
    </>
  );
}
