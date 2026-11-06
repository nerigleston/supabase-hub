import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { buildIntrospection, checkIntrospectionAuth } from "@/lib/introspection";
import { mcpAccess } from "@/lib/mcp";
import { inspectAccessToken } from "@/lib/oauth";

// RFC 7662: introspecção para o modo "OAuth externo" do jangada Cloud. O gateway do
// jangada valida aqui o Bearer que o cliente MCP mandou e repassa o resultado ao
// servidor MCP em headers x-jangada-*. Sem JANGADA_INTROSPECTION_SECRET a rota não existe (404).
// Nada de tokens do Supabase nos claims: a execução continua em /api/mcp/call com o Bearer.

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };
const inactive = () => Response.json({ active: false }, { headers: noStore });

export async function POST(request: NextRequest) {
  const secret = env.introspectionSecret;
  if (!secret) return new Response(null, { status: 404 });

  if (!checkIntrospectionAuth(request.headers.get("authorization"), secret)) {
    return Response.json(
      { error: "invalid_client" },
      { status: 401, headers: { ...noStore, "WWW-Authenticate": 'Basic realm="introspect"' } },
    );
  }

  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();
  if (!token) return inactive();

  const info = await inspectAccessToken(token);
  if (!info) return inactive();

  // Reconfirma o plano e a config do MCP agora, como o GET /api/mcp/tools faz.
  const access = await mcpAccess(info.tenantId);

  return Response.json(
    buildIntrospection({
      tenantId: info.tenantId,
      email: info.email,
      exp: info.exp,
      scope: info.scope,
      clientId: info.clientId,
      aud: env.mcpUrlConfigured,
      plan: access.plan,
      mcp: access.mcp,
      tools: access.tools.map((t) => t.name),
    }),
    { headers: noStore },
  );
}
