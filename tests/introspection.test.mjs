// Testes da introspecção (modo OAuth externo do jangada). Rodar: npm test
// Node 23.6+ lê o .ts direto (remove os tipos), sem dependência nova.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIntrospection, checkIntrospectionAuth } from "../src/lib/introspection.ts";

const SECRET = "segredo-de-teste";
const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

test("aceita jangada:<segredo>", () => {
  assert.equal(checkIntrospectionAuth(basic("jangada", SECRET), SECRET), true);
  assert.equal(checkIntrospectionAuth(basic("jangada", SECRET).replace("Basic", "basic"), SECRET), true);
});

test("recusa segredo errado, usuário errado, header ausente ou malformado", () => {
  assert.equal(checkIntrospectionAuth(basic("jangada", "outro"), SECRET), false);
  assert.equal(checkIntrospectionAuth(basic("admin", SECRET), SECRET), false);
  assert.equal(checkIntrospectionAuth(null, SECRET), false);
  assert.equal(checkIntrospectionAuth("", SECRET), false);
  assert.equal(checkIntrospectionAuth(`Bearer ${SECRET}`, SECRET), false);
  assert.equal(checkIntrospectionAuth("Basic !!!", SECRET), false);
});

test("sem segredo configurado, nada passa", () => {
  assert.equal(checkIntrospectionAuth(basic("jangada", ""), ""), false);
});

test("resposta ativa no formato do contrato", () => {
  const out = buildIntrospection({
    tenantId: "t-1",
    email: "pessoa@empresa.com",
    exp: 1793660000,
    scope: "mcp",
    clientId: "mcp_abc",
    aud: "https://api.mcp.jangada.dev.br/s/basehub-mcp/mcp",
    plan: "business",
    mcp: true,
    tools: ["list_projects", "run_sql"],
  });
  assert.deepEqual(out, {
    active: true,
    sub: "t-1",
    email: "pessoa@empresa.com",
    exp: 1793660000,
    scope: "mcp",
    token_type: "Bearer",
    client_id: "mcp_abc",
    aud: "https://api.mcp.jangada.dev.br/s/basehub-mcp/mcp",
    jangada_claims: { v: 1, tenant_id: "t-1", plan: "business", mcp: true, tools: ["list_projects", "run_sql"] },
  });
});

test("sem plano com MCP, tools vem vazio; client_id e aud ausentes não aparecem", () => {
  const out = buildIntrospection({ tenantId: "t-2", email: "a@b.c", exp: 1, scope: "mcp", aud: null, plan: "pro", mcp: false, tools: ["list_projects"] });
  assert.equal("client_id" in out, false);
  assert.equal("aud" in out, false);
  assert.deepEqual(out.jangada_claims.tools, []);
  assert.equal(out.jangada_claims.mcp, false);
});

test("claims não carregam nada além do previsto (nenhum token do Supabase)", () => {
  const out = buildIntrospection({ tenantId: "t", email: "e", exp: 1, scope: "mcp", plan: "business", mcp: true, tools: [] });
  assert.deepEqual(Object.keys(out.jangada_claims).sort(), ["mcp", "plan", "tenant_id", "tools", "v"]);
});
