import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createAuthCode, getClient } from "@/lib/oauth";
import { hasMcp, orgUsage } from "@/lib/plans";
import { getSession } from "@/lib/session";

// Navegação GET (não é form) que emite o código e redireciona ao cliente MCP.
// O código é uso único e preso ao PKCE, então o GET com efeito é seguro aqui.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const codeChallenge = q.get("code_challenge") ?? "";
  const method = q.get("code_challenge_method") ?? "";
  const state = q.get("state") ?? "";
  const resource = q.get("resource") ?? "";
  const scope = q.get("scope") || "mcp";

  const session = await getSession();
  if (!session) {
    const back = `/oauth/authorize?${q}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }
  if (method !== "S256" || !codeChallenge) redirect("/painel");

  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) redirect("/painel");

  const plan = (await orgUsage(session!.tenantId)).plan;
  if (!hasMcp(plan)) redirect("/assinar");

  const code = await createAuthCode({
    clientId,
    redirectUri,
    tenantId: session!.tenantId,
    email: session!.email,
    codeChallenge,
    scope,
    resource: resource || undefined,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  redirect(url.toString());
}
