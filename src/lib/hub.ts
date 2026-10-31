import "server-only";
import { cache } from "react";
import { type Connection, getConnection, type KeepAlive, listConnections, listKeepAlive, listPatLogins, setConnectionFields } from "./db";
import { syncPatLogin } from "./pat";
import { COUNTS_AS_ACTIVE, FREE_PLAN_ACTIVE_LIMIT } from "./status";
import { clientFor, inferLogin, type Project, SupabaseApiError } from "./supabase-api";

export type AccountView = {
  orgSlug: string;
  name: string;
  plan?: string;
  status: Connection["status"];
  connectedAt: string;
  login?: string;
  loginVerified?: boolean;
  authKind: "oauth" | "pat";
  projects: Project[];
  /** Projetos ativos desta organização. */
  activeCount: number;
  /**
   * Vagas Free do LOGIN dono desta org (o limite de 2 ativos é por conta Supabase,
   * somando todas as organizações Free dela). null quando a org não é Free.
   */
  freeSlots: number | null;
  error?: string;
};

/** Resumo por login Supabase: é aqui que vale o limite do plano Free. */
export type LoginSummary = {
  key: string;
  login?: string;
  orgSlugs: string[];
  /** Ativos em organizações Free deste login. */
  activeFree: number;
  freeSlots: number;
};

/** Login conhecido agrupa; sem login, cada org conta sozinha (melhor estimativa). */
const loginKey = (a: Pick<AccountView, "login" | "orgSlug">) => a.login ?? `org:${a.orgSlug}`;

export type KeepAliveView = Pick<KeepAlive, "enabled" | "lastPingAt" | "lastOk" | "lastError" | "lastManualPingAt">;

export type ProjectRow = Project & { account: string; accountSlug: string; login?: string; keepAlive?: KeepAliveView };

function isFree(plan?: string) {
  return !plan || plan.toLowerCase() === "free";
}

/** Projeto + conexão, deduplicado entre layout e páginas na mesma requisição. */
export const loadProject = cache(
  async (tenant: string, orgSlug: string, ref: string): Promise<{ conn: Connection; project: Project; loadedAt: number } | { error: string; conn?: Connection }> => {
    const conn = await getConnection(tenant, orgSlug);
    if (!conn) return { error: "Esta conta não está conectada ao painel." };
    try {
      return { conn, project: await clientFor(conn).getProject(ref), loadedAt: Date.now() };
    } catch (err) {
      return { conn, error: err instanceof Error ? err.message : "Falha ao consultar o projeto." };
    }
  },
);

/**
 * Lê todas as contas em paralelo. Uma conta com erro não derruba as outras:
 * o erro vira campo do resultado.
 */
export async function loadHub(tenant: string): Promise<{ accounts: AccountView[]; projects: ProjectRow[]; logins: LoginSummary[]; loadedAt: number; loginErrors: Record<string, string> }> {
  // Logins por Access Token trazem organizações novas automaticamente.
  const patLogins = await listPatLogins(tenant);
  const patErrors = new Map<string, string>();
  await Promise.all(
    patLogins.map((l) =>
      syncPatLogin(tenant, l, l.connectedBy).catch((err) => {
        patErrors.set(l.email, err instanceof Error ? err.message : String(err));
      }),
    ),
  );
  const [connections, keepAlives] = await Promise.all([listConnections(tenant), listKeepAlive(tenant)]);
  const kaByRef = new Map(keepAlives.map((k) => [k.ref, k]));

  const accounts = await Promise.all(
    connections.map(async (conn): Promise<AccountView> => {
      const name = conn.label || conn.orgName;
      const base = {
        orgSlug: conn.orgSlug,
        name,
        plan: conn.plan,
        status: conn.status,
        connectedAt: conn.connectedAt,
        login: conn.login,
        loginVerified: conn.loginVerified,
        authKind: conn.authKind ?? "oauth",
      };
      try {
        const api = clientFor(conn);
        // Conexões antigas sem login identificado: tenta inferir uma vez pelos membros.
        if (!conn.login) {
          const identity = inferLogin(await api.listMembers().catch(() => []));
          if (identity.login) {
            Object.assign(base, identity);
            await setConnectionFields(conn.tenantId, conn.orgSlug, identity).catch(() => {});
          }
        }
        const all = await api.listProjects();
        const projects = all.filter((p) => p.organization_slug === conn.orgSlug && p.status !== "REMOVED");
        const activeCount = projects.filter((p) => COUNTS_AS_ACTIVE.has(p.status)).length;
        return { ...base, status: "ok", projects, activeCount, freeSlots: null };
      } catch (err) {
        return {
          ...base,
          status: err instanceof SupabaseApiError && err.needsReauth ? "reauth" : conn.status,
          projects: [],
          activeCount: 0,
          freeSlots: null,
          error: err instanceof Error ? err.message : "Falha ao consultar o Supabase.",
        };
      }
    }),
  );

  // Limite Free por login: soma os ativos de todas as orgs Free do mesmo login.
  const byLogin = new Map<string, LoginSummary>();
  for (const a of accounts) {
    const key = loginKey(a);
    const s = byLogin.get(key) ?? { key, login: a.login, orgSlugs: [], activeFree: 0, freeSlots: 0 };
    s.orgSlugs.push(a.orgSlug);
    if (isFree(a.plan)) s.activeFree += a.activeCount;
    byLogin.set(key, s);
  }
  for (const s of byLogin.values()) s.freeSlots = Math.max(0, FREE_PLAN_ACTIVE_LIMIT - s.activeFree);
  for (const a of accounts) {
    if (!a.error && isFree(a.plan)) a.freeSlots = byLogin.get(loginKey(a))!.freeSlots;
  }
  const logins = [...byLogin.values()];

  const projects = accounts
    .flatMap((a) =>
      a.projects.map((p) => {
        const ka = kaByRef.get(p.ref);
        return {
          ...p,
          account: a.name,
          accountSlug: a.orgSlug,
          login: a.login,
          keepAlive: ka
            ? { enabled: ka.enabled, lastPingAt: ka.lastPingAt, lastOk: ka.lastOk, lastError: ka.lastError, lastManualPingAt: ka.lastManualPingAt }
            : undefined,
        };
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return { accounts, projects, logins, loadedAt: Date.now(), loginErrors: Object.fromEntries(patErrors) };
}
