import { env } from "@/lib/env";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// RFC 8414: descoberta do Authorization Server. O cliente MCP lê isto para saber
// onde autorizar e trocar tokens.
export function GET() {
  const base = env.appUrl;
  return Response.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["mcp"],
    },
    { headers: cors },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
