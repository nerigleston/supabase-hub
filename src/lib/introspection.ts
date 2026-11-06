import { createHash, timingSafeEqual } from "node:crypto";

// Introspecção (RFC 7662) para o modo "OAuth externo" do jangada Cloud.
// Funções puras (sem DynamoDB nem "server-only") para rodar nos testes com `node --test`.

/** Usuário fixo do Basic auth que o gateway do jangada manda. */
export const INTROSPECTION_USER = "jangada";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Confere `Authorization: Basic base64("jangada:<segredo>")` em tempo constante.
 * Compara os sha256 (mesmo tamanho sempre), então o tempo não depende do que veio.
 */
export function checkIntrospectionAuth(header: string | null | undefined, secret: string): boolean {
  if (!secret) return false;
  const raw = header ?? "";
  const given = raw.slice(0, 6).toLowerCase() === "basic " ? raw.slice(6).trim() : "";
  let decoded = "";
  try {
    decoded = Buffer.from(given, "base64").toString("utf8");
  } catch {
    decoded = "";
  }
  return timingSafeEqual(digest(decoded), digest(`${INTROSPECTION_USER}:${secret}`));
}

/** O que o servidor MCP (basehub-mcp) usa para decidir as ferramentas. Versão 1. */
export type JangadaClaims = {
  v: 1;
  tenant_id: string;
  plan: string;
  /** O plano inclui o MCP (Business). Sem ele, `tools` vem vazio. */
  mcp: boolean;
  /** Nomes das ferramentas liberadas (os mesmos de GET /api/mcp/tools). */
  tools: string[];
};

export type ActiveIntrospection = {
  active: true;
  sub: string;
  email: string;
  exp: number;
  scope: string;
  token_type: "Bearer";
  client_id?: string;
  aud?: string;
  jangada_claims: JangadaClaims;
};

export function buildIntrospection(p: {
  tenantId: string;
  email: string;
  exp: number;
  scope: string;
  clientId?: string;
  aud?: string | null;
  plan: string;
  mcp: boolean;
  tools: string[];
}): ActiveIntrospection {
  const out: ActiveIntrospection = {
    active: true,
    sub: p.tenantId,
    email: p.email,
    exp: p.exp,
    scope: p.scope,
    token_type: "Bearer",
    jangada_claims: { v: 1, tenant_id: p.tenantId, plan: p.plan, mcp: p.mcp, tools: p.mcp ? p.tools : [] },
  };
  if (p.clientId) out.client_id = p.clientId;
  if (p.aud) out.aud = p.aud;
  return out;
}
