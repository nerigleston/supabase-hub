import "server-only";
import { decrypt, encrypt } from "./crypto";
import { type Connection, getConnection, setConnectionFields, updateTokens } from "./db";
import { env } from "./env";

const API = "https://api.supabase.com";

export type ProjectStatus =
  | "INACTIVE"
  | "ACTIVE_HEALTHY"
  | "ACTIVE_UNHEALTHY"
  | "COMING_UP"
  | "UNKNOWN"
  | "GOING_DOWN"
  | "INIT_FAILED"
  | "REMOVED"
  | "RESTORING"
  | "UPGRADING"
  | "PAUSING"
  | "RESTORE_FAILED"
  | "RESTARTING"
  | "PAUSE_FAILED"
  | "RESIZING";

export type Project = {
  ref: string;
  organization_slug: string;
  name: string;
  region: string;
  created_at: string;
  status: ProjectStatus;
  database?: { host: string; version: string };
};

export type Organization = { id: string; slug?: string; name: string; plan?: string };

export type Member = { user_id: string; user_name: string; email?: string; role_name: string };

export type PoolerConfig = {
  connection_string: string;
  database_type: "PRIMARY" | "READ_REPLICA";
  db_host: string;
  db_name: string;
  db_port: number;
  db_user: string;
  pool_mode: "transaction" | "session";
};

export type ApiKey = {
  id?: string;
  name: string;
  type?: "legacy" | "publishable" | "secret" | null;
  api_key?: string | null;
  description?: string | null;
};

export type TokenSet = { access_token: string; refresh_token: string; expires_in: number };

/** Erro com mensagem já pronta para o usuário (heurística 9). */
export class SupabaseApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public needsReauth = false,
  ) {
    super(message);
  }
}

function basicAuth() {
  return "Basic " + Buffer.from(`${env.supabase.clientId}:${env.supabase.clientSecret}`).toString("base64");
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${API}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuth(),
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SupabaseApiError(
      `O Supabase recusou o token (${res.status}). Reconecte a conta. ${text.slice(0, 200)}`,
      res.status,
      res.status === 400 || res.status === 401,
    );
  }
  return res.json();
}

export function authorizeUrl(params: { state: string; challenge: string }) {
  const url = new URL(`${API}/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    client_id: env.supabase.clientId,
    redirect_uri: `${env.appUrl}/api/supabase/callback`,
    response_type: "code",
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function exchangeCode(code: string, verifier: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${env.appUrl}/api/supabase/callback`,
    code_verifier: verifier,
  });
}

export function sealTokens(tokens: TokenSet) {
  return {
    accessToken: encrypt(tokens.access_token),
    refreshToken: encrypt(tokens.refresh_token),
    // margem de 60s para não usar token no limite da expiração
    expiresAt: Date.now() + (tokens.expires_in - 60) * 1000,
  };
}

/** Access token válido para a conexão, renovando quando necessário. */
async function accessTokenFor(conn: Connection): Promise<string> {
  // Access Token (PAT) não expira por refresh: é usado direto.
  if (conn.authKind === "pat" || conn.expiresAt > Date.now()) return decrypt(conn.accessToken);

  try {
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(conn.refreshToken) });
    const sealed = sealTokens(tokens);
    const won = await updateTokens(conn.tenantId, conn.orgSlug, conn.expiresAt, sealed);
    if (won) return tokens.access_token;
  } catch (err) {
    // Outra requisição pode ter renovado (refresh token rotaciona): relê antes de desistir.
    const fresh = await getConnection(conn.tenantId, conn.orgSlug);
    if (fresh && fresh.expiresAt > Date.now()) return decrypt(fresh.accessToken);
    if (err instanceof SupabaseApiError && err.needsReauth) {
      await setConnectionFields(conn.tenantId, conn.orgSlug, { status: "reauth" });
    }
    throw err;
  }

  const fresh = await getConnection(conn.tenantId, conn.orgSlug);
  if (!fresh) throw new SupabaseApiError("Conta desconectada.", 404);
  return decrypt(fresh.accessToken);
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {}
    throw new SupabaseApiError(friendlyError(res.status, message), res.status, res.status === 401);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function friendlyError(status: number, message: string) {
  // limite Free do Supabase: é por pessoa (dona/admin), somando todas as orgs dela
  if (/maximum limits for the number of active free projects/i.test(message)) {
    const who = message.split(":").slice(1).join(":").replace(/\(\d+ project limit\)/gi, "").split(/\.\s/)[0].trim();
    return `O Supabase recusou: ${who || "um dono ou admin desta organização"} já tem 2 bancos grátis ligados, somando todas as organizações em que é dono ou admin (inclusive as que não estão no BaseHub). Pause ou exclua um banco dessa pessoa, ou crie em outra organização.`;
  }
  switch (status) {
    case 401:
      return "Acesso expirado ou revogado. Reconecte esta conta em Contas.";
    case 403:
      return `Sem permissão para esta ação. Confira os scopes do OAuth App (Projects: leitura e escrita). ${message}`;
    case 429:
      return "Limite de requisições do Supabase atingido. Aguarde um minuto e tente de novo.";
    default:
      return message || `Erro ${status} na API do Supabase.`;
  }
}

/** Cliente da Management API para uma organização conectada. */
export function clientFor(conn: Connection) {
  const run = async <T>(method: string, path: string, body?: unknown) => {
    const token = await accessTokenFor(conn);
    try {
      return await call<T>(token, method, path, body);
    } catch (err) {
      if (err instanceof SupabaseApiError && err.needsReauth) {
        await setConnectionFields(conn.tenantId, conn.orgSlug, { status: "reauth" });
      }
      throw err;
    }
  };

  return {
    listProjects: () => run<Project[]>("GET", "/v1/projects"),
    getOrganization: () => run<Organization>("GET", `/v1/organizations/${conn.orgSlug}`),
    listMembers: () => run<Member[]>("GET", `/v1/organizations/${conn.orgSlug}/members`),
    restoreProject: (ref: string) => run<void>("POST", `/v1/projects/${ref}/restore`),
    pauseProject: (ref: string) => run<void>("POST", `/v1/projects/${ref}/pause`),
    createProject: (input: { name: string; region: string; dbPass: string }) =>
      run<Project>("POST", "/v1/projects", {
        name: input.name,
        organization_slug: conn.orgSlug,
        region: input.region,
        db_pass: input.dbPass,
      }),
    getProject: (ref: string) => run<Project>("GET", `/v1/projects/${ref}`),
    deleteProject: (ref: string) => run<void>("DELETE", `/v1/projects/${ref}`),
    getPooler: (ref: string) => run<PoolerConfig[]>("GET", `/v1/projects/${ref}/config/database/pooler`),
    getApiKeys: (ref: string) => run<ApiKey[]>("GET", `/v1/projects/${ref}/api-keys?reveal=true`),
    updatePassword: (ref: string, password: string) =>
      run<{ message: string }>("PATCH", `/v1/projects/${ref}/database/password`, { password }),
    query: <T = Record<string, unknown>>(ref: string, query: string, opts: { readOnly?: boolean; parameters?: unknown[] } = {}) =>
      run<T[]>("POST", `/v1/projects/${ref}/database/query`, {
        query,
        read_only: opts.readOnly ?? false,
        ...(opts.parameters ? { parameters: opts.parameters } : {}),
      }),
  };
}

/** Usado logo após o callback, antes de existir a conexão no banco. */
export async function listOrganizationsWithToken(accessToken: string) {
  return call<Organization[]>(accessToken, "GET", "/v1/organizations");
}

export async function getOrganizationWithToken(accessToken: string, slug: string) {
  return call<Organization>(accessToken, "GET", `/v1/organizations/${slug}`);
}

export async function listMembersWithToken(accessToken: string, slug: string) {
  return call<Member[]>(accessToken, "GET", `/v1/organizations/${slug}/members`);
}

/** Cria uma organização na conta do Access Token. OAuth (por org) não cria orgs. */
export async function createOrgWithToken(accessToken: string, name: string) {
  return call<Organization>(accessToken, "POST", "/v1/organizations", { name });
}

/**
 * O OAuth do Supabase não informa o e-mail de quem autorizou (/v1/profile não
 * aceita token OAuth). Inferimos pelos membros da organização:
 * dica informada pelo usuário que bate com um membro → verificado;
 * organização com um único membro → é ele.
 */
export function inferLogin(members: Member[], hint?: string): { login?: string; loginVerified?: boolean } {
  const emails = members.map((m) => m.email?.toLowerCase()).filter((e): e is string => Boolean(e));
  const h = hint?.trim().toLowerCase();
  if (h && emails.includes(h)) return { login: h, loginVerified: true };
  if (emails.length === 1) return { login: emails[0], loginVerified: true };
  if (h) return { login: h, loginVerified: false };
  return {};
}

export type Profile = { gotrue_id: string; primary_email: string; username?: string };

/** Só funciona com Access Token (PAT); o OAuth ainda não tem acesso a /v1/profile. */
export async function getProfileWithToken(accessToken: string) {
  return call<Profile>(accessToken, "GET", "/v1/profile");
}

/** Marca conexões como OAuth ou PAT sem expor o refresh a quem não precisa. */
export const PAT_EXPIRES_AT = Number.MAX_SAFE_INTEGER;
