import "server-only";
import { getConnection, type KeepAlive, recordPing } from "./db";
import { clientFor, SupabaseApiError } from "./supabase-api";

/**
 * Um `select 1` no banco: conta como atividade e reinicia a contagem de 7 dias
 * que o Supabase usa para pausar projetos do plano grátis.
 */
export async function pingProject(ka: Pick<KeepAlive, "tenantId" | "orgSlug" | "ref">): Promise<{ ok: boolean; error?: string }> {
  let result: { ok: boolean; error?: string };
  const conn = await getConnection(ka.tenantId, ka.orgSlug);
  if (!conn) {
    result = { ok: false, error: "Conta desconectada do Hub." };
  } else {
    const api = clientFor(conn);
    try {
      await api.query(ka.ref, "select 1 as keepalive", { readOnly: true });
      result = { ok: true };
    } catch (err) {
      // Projeto pausado não responde a SQL: explica em vez de mostrar o erro cru.
      const status = await api.getProject(ka.ref).then((p) => p.status).catch(() => null);
      result = {
        ok: false,
        error:
          status === "INACTIVE"
            ? "Projeto pausado: reative para o keep-alive voltar a funcionar."
            : err instanceof SupabaseApiError && err.needsReauth
              ? "Acesso à conta expirou: reconecte em Contas."
              : err instanceof Error
                ? err.message
                : String(err),
      };
    }
  }
  await recordPing(ka.tenantId, ka.ref, result).catch(() => {});
  return result;
}

/** Executa tarefas com no máximo `limit` em paralelo. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Ping manual: no máximo 1 a cada 10 minutos por projeto (protege a API do Supabase). */
export const MANUAL_PING_COOLDOWN_MS = 10 * 60 * 1000;

export function manualPingAvailableAt(lastManualPingAt?: string) {
  return lastManualPingAt ? new Date(lastManualPingAt).getTime() + MANUAL_PING_COOLDOWN_MS : 0;
}
