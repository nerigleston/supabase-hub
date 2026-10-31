import type { NextRequest } from "next/server";
import { registerClient } from "@/lib/oauth";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// RFC 7591: registro dinâmico de cliente. Cliente público (PKCE), sem secret.
export async function POST(request: NextRequest) {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length) return Response.json({ error: "invalid_redirect_uri" }, { status: 400, headers: cors });

  const client = await registerClient(uris, typeof body.client_name === "string" ? body.client_name : undefined);
  return Response.json(
    {
      client_id: client.clientId,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: cors },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
