import type { NextRequest } from "next/server";
import { allowedTools } from "@/lib/mcp";
import { validateAccessToken } from "@/lib/oauth";

// O servidor MCP (app.mcp.jangada.dev.br) chama isto a cada requisição para saber
// quais ferramentas liberar ao usuário (plano Business + config dele).
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const claims = token ? await validateAccessToken(token) : null;
  if (!claims) return Response.json({ error: "invalid_token" }, { status: 401 });

  const tools = (await allowedTools(claims.tenantId)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.destructive ? { destructiveHint: true, readOnlyHint: false } : undefined,
  }));
  return Response.json({ tools });
}
