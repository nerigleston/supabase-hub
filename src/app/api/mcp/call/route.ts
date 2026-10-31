import type { NextRequest } from "next/server";
import { addLog } from "@/lib/db";
import { executeTool, McpError } from "@/lib/mcp";
import { validateAccessToken } from "@/lib/oauth";

// Executa uma ação pedida pelo servidor MCP, em nome do usuário do token.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const claims = token ? await validateAccessToken(token) : null;
  if (!claims) return Response.json({ error: "invalid_token" }, { status: 401 });

  let body: { tool?: unknown; arguments?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const tool = typeof body.tool === "string" ? body.tool : "";
  const args = (body.arguments && typeof body.arguments === "object" ? body.arguments : {}) as Record<string, unknown>;
  if (!tool) return Response.json({ error: "tool é obrigatório" }, { status: 400 });

  try {
    const content = await executeTool(claims.tenantId, claims.email, tool, args);
    await addLog(claims.tenantId, { user: `mcp:${claims.email}`, action: `mcp_${tool}`, target: String(args.project_ref ?? args.name ?? ""), ok: true });
    return Response.json({ content });
  } catch (err) {
    const status = err instanceof McpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Falha ao executar.";
    await addLog(claims.tenantId, { user: `mcp:${claims.email}`, action: `mcp_${tool}`, target: String(args.project_ref ?? ""), ok: false, detail: message.slice(0, 200) });
    return Response.json({ error: message }, { status });
  }
}
