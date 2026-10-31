import type { NextRequest } from "next/server";
import { consumeAuthCode, issueTokens, refreshTokens } from "@/lib/oauth";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const err = (code: string, status = 400) => Response.json({ error: code }, { status, headers: cors });

// RFC 6749 §4.1.3 / §6: troca de código e refresh. Cliente público (PKCE).
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return err("invalid_request");
  const grant = String(form.get("grant_type") ?? "");

  if (grant === "authorization_code") {
    const code = String(form.get("code") ?? "");
    const verifier = String(form.get("code_verifier") ?? "");
    const clientId = String(form.get("client_id") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    if (!code || !verifier || !clientId || !redirectUri) return err("invalid_request");
    const claims = await consumeAuthCode(code, verifier, clientId, redirectUri);
    if (!claims) return err("invalid_grant");
    return Response.json(await issueTokens(claims.tenantId, claims.email, claims.scope), { headers: cors });
  }

  if (grant === "refresh_token") {
    const rt = String(form.get("refresh_token") ?? "");
    if (!rt) return err("invalid_request");
    const tokens = await refreshTokens(rt);
    if (!tokens) return err("invalid_grant");
    return Response.json(tokens, { headers: cors });
  }

  return err("unsupported_grant_type");
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
