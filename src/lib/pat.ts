import "server-only";
import { decrypt } from "./crypto";
import { type Connection, getConnection, listConnections, type PatLogin, putConnection } from "./db";
import { getOrganizationWithToken, listOrganizationsWithToken, PAT_EXPIRES_AT } from "./supabase-api";

/**
 * Garante uma conexão para cada organização do login do Access Token.
 * Orgs criadas depois no Supabase aparecem sozinhas; as que o usuário
 * desconectou (ignored) não voltam. Só grava o que mudou.
 */
export async function syncPatLogin(tenant: string, login: PatLogin, connectedBy: string) {
  const token = decrypt(login.token);
  const orgs = await listOrganizationsWithToken(token);
  const ignored = new Set(login.ignored ?? []);
  const added: string[] = [];

  await Promise.all(
    orgs.map(async (org) => {
      const slug = org.slug ?? org.id;
      if (ignored.has(slug)) return;
      const existing = await getConnection(tenant, slug);
      // já sincronizada com esta versão do token
      if (existing?.authKind === "pat" && existing.tokenVersion === login.createdAt) return;

      const detail = await getOrganizationWithToken(token, slug).catch(() => null);
      const conn: Connection = {
        tenantId: tenant,
        orgSlug: slug,
        orgName: org.name,
        plan: detail?.plan ?? existing?.plan,
        label: existing?.label,
        accessToken: login.token, // mesmo segredo criptografado do login
        refreshToken: "",
        expiresAt: PAT_EXPIRES_AT,
        connectedAt: existing?.connectedAt ?? new Date().toISOString(),
        connectedBy,
        status: "ok",
        login: login.email,
        loginVerified: true,
        authKind: "pat",
        tokenVersion: login.createdAt,
      };
      await putConnection(conn);
      if (!existing) added.push(org.name);
    }),
  );

  return { added, total: orgs.length - [...ignored].filter((s) => orgs.some((o) => (o.slug ?? o.id) === s)).length };
}

/** Conexões PAT de um login (para desconectar o login inteiro). */
export async function connectionsOfLogin(tenant: string, email: string) {
  return (await listConnections(tenant)).filter((c) => c.authKind === "pat" && c.login === email);
}
