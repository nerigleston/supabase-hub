"use server";

import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import { Client } from "pg";
import { SUPABASE_ROOT_CA } from "@/lib/supabase-ca";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  addLog,
  deleteConnection,
  deleteDescription,
  getDescribeCount,
  getDescription,
  putDescribeCount,
  putDescription,
  getConnection,
  getPassword,
  putPassword,
  setConnectionFields,
} from "@/lib/db";
import { deleteKeepAlive, deletePassword, deletePatLogin, getPatLogin, listKeepAlive, putConnection, putKeepAlive, putPatLogin } from "@/lib/db";
import { manualPingAvailableAt, mapLimit, pingProject } from "@/lib/keepalive";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { loadHub } from "@/lib/hub";
import { connectionsOfLogin, syncPatLogin } from "@/lib/pat";
import { cancelSubscription } from "@/lib/abacatepay";
import { diffSchema, generateDraft, schemaSnapshot } from "@/lib/describe";
import { env } from "@/lib/env";
import { getBilling, hasMcp, orgBudget, orgUsage, updateBilling } from "@/lib/plans";
import { type McpConfig, setMcpConfig } from "@/lib/mcp";
import { type Access, actor, requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/session";
import { removeAllMembers } from "@/lib/shares";
import { REGIONS } from "@/lib/status";
import { clientFor, createOrgWithToken, getProfileWithToken, PAT_EXPIRES_AT, type Project, SupabaseApiError } from "@/lib/supabase-api";

export type ActionResult<T = undefined> = { ok: boolean; message: string; data?: T };

function fail(err: unknown): ActionResult<never> {
  return { ok: false, message: err instanceof Error ? err.message : "Erro inesperado." };
}

async function connectionOrThrow(tenant: string, orgSlug: string) {
  const conn = await getConnection(tenant, orgSlug);
  if (!conn) throw new Error("Conta não encontrada. Ela pode ter sido desconectada.");
  return conn;
}

function generatePassword(length = 24) {
  // Sem símbolos: a senha vai em connection strings e não precisa de escape.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join("");
}

// ---------- projetos ----------

/** Porteiro das ações de banco: dono ou convidado com o papel mínimo. */
async function gate(orgSlug: string, ref: string, need: Parameters<typeof requireAccess>[2]): Promise<Access | ActionResult<never>> {
  try {
    return await requireAccess(orgSlug, ref, need);
  } catch (err) {
    return fail(err);
  }
}
const denied = (x: Access | ActionResult<never>): x is ActionResult<never> => "ok" in x;


export async function restoreProjectAction(orgSlug: string, ref: string, name: string): Promise<ActionResult> {
  const a = await gate(orgSlug, ref, "write");
  if (denied(a)) return a;
  try {
    await clientFor(a.conn).restoreProject(ref);
    await addLog(a.tenant, { user: actor(a), action: "reativar", target: `${name} (${ref})`, ok: true });
    revalidatePath("/", "layout");
    return { ok: true, message: `Reativação de "${name}" iniciada. Leva de 2 a 5 minutos.` };
  } catch (err) {
    await addLog(a.tenant, { user: actor(a), action: "reativar", target: `${name} (${ref})`, ok: false, detail: String(err) });
    return fail(err);
  }
}

export async function pauseProjectAction(orgSlug: string, ref: string, name: string): Promise<ActionResult> {
  const a = await gate(orgSlug, ref, "write");
  if (denied(a)) return a;
  try {
    await clientFor(a.conn).pauseProject(ref);
    await addLog(a.tenant, { user: actor(a), action: "pausar", target: `${name} (${ref})`, ok: true });
    revalidatePath("/", "layout");
    return { ok: true, message: `"${name}" está sendo pausado. Isso libera espaço para outro banco grátis nesse e-mail.` };
  } catch (err) {
    await addLog(a.tenant, { user: actor(a), action: "pausar", target: `${name} (${ref})`, ok: false, detail: String(err) });
    return fail(err);
  }
}

export async function deleteProjectAction(orgSlug: string, ref: string, name: string): Promise<ActionResult> {
  const a = await gate(orgSlug, ref, "delete");
  if (denied(a)) return a;
  try {
    await clientFor(a.conn).deleteProject(ref);
    // limpa o que o Hub guardava desse projeto (senha, keep-alive, descrição e compartilhamentos)
    await Promise.all([
      deletePassword(a.tenant, ref).catch(() => {}),
      deleteKeepAlive(a.tenant, ref).catch(() => {}),
      deleteDescription(a.tenant, ref).catch(() => {}),
      removeAllMembers(a.tenant, ref).catch(() => {}),
    ]);
    await addLog(a.tenant, { user: actor(a), action: "excluir_projeto", target: `${name} (${ref})`, ok: true });
    revalidatePath("/", "layout");
    return { ok: true, message: `Banco "${name}" excluído no Supabase. Não há como desfazer.` };
  } catch (err) {
    await addLog(a.tenant, { user: actor(a), action: "excluir_projeto", target: `${name} (${ref})`, ok: false, detail: String(err) });
    return fail(err);
  }
}

/** Cria uma organização nova em um login conectado por Access Token. */
export async function createOrgAction(loginEmail: string, name: string): Promise<ActionResult<{ slug: string }>> {
  const session = await requireSession();
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, message: "Dê um nome com pelo menos 2 caracteres." };
  const rl = await rateLimit(session.tenantId, "create", 10, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  try {
    const usage = await orgUsage(session.tenantId);
    if (usage.limit !== null && usage.used >= usage.limit) {
      return { ok: false, message: `Seu plano permite ${usage.limit} organização(ões). Assine o Pro ou desconecte uma para criar outra.` };
    }
    const login = await getPatLogin(session.tenantId, loginEmail);
    if (!login) return { ok: false, message: "Só contas conectadas por Access Token podem criar organizações. Conecte a conta por token em Contas." };

    const org = await createOrgWithToken(decrypt(login.token), trimmed);
    const slug = org.slug ?? org.id;
    const now = new Date().toISOString();
    await putConnection({
      tenantId: session.tenantId,
      orgSlug: slug,
      orgName: org.name,
      plan: "free",
      accessToken: login.token,
      refreshToken: "",
      expiresAt: PAT_EXPIRES_AT,
      connectedAt: now,
      connectedBy: session.email,
      status: "ok",
      login: login.email,
      loginVerified: true,
      authKind: "pat",
      tokenVersion: login.createdAt,
    });
    await addLog(session.tenantId, { user: session.email, action: "criar_org", target: `${org.name} (${login.email})`, ok: true });
    revalidatePath("/", "layout");
    return { ok: true, message: `Organização "${org.name}" criada em ${login.email}.`, data: { slug } };
  } catch (err) {
    await addLog(session.tenantId, { user: session.email, action: "criar_org", target: `${trimmed} (${loginEmail})`, ok: false, detail: String(err) });
    return fail(err);
  }
}

export type CreatedProject = { ref: string; orgSlug: string; name: string; password: string; account: string };

export async function createProjectAction(
  _prev: ActionResult<CreatedProject> | null,
  form: FormData,
): Promise<ActionResult<CreatedProject>> {
  const session = await requireSession();
  const name = String(form.get("name") ?? "").trim();
  const region = String(form.get("region") ?? "");
  let orgSlug = String(form.get("org") ?? "auto");
  const password = String(form.get("password") ?? "").trim() || generatePassword();

  if (name.length < 3) return { ok: false, message: "Dê um nome com pelo menos 3 caracteres." };
  if (!REGIONS.some((r) => r.code === region)) return { ok: false, message: "Escolha uma região da lista." };
  if (password.length < 12) return { ok: false, message: "A senha precisa ter pelo menos 12 caracteres." };
  const rl = await rateLimit(session.tenantId, "create", 10, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    if (orgSlug === "auto") {
      const { accounts } = await loadHub(session.tenantId);
      const target = accounts.find((a) => !a.error && a.status === "ok" && (a.freeSlots === null || a.freeSlots > 0));
      if (!target) return { ok: false, message: "Todos os e-mails já estão com 2 bancos grátis ligados. Pause um banco ou conecte outra conta." };
      orgSlug = target.orgSlug;
    }
    const conn = await connectionOrThrow(session.tenantId, orgSlug);
    const project: Project = await clientFor(conn).createProject({ name, region, dbPass: password });
    await putPassword(session.tenantId, project.ref, encrypt(password), "created");
    await addLog(session.tenantId, { user: session.email, action: "criar_projeto", target: `${name} (${project.ref}) em ${conn.orgName}`, ok: true });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Projeto "${name}" criado em ${conn.label || conn.orgName}. Ele leva alguns minutos para subir.`,
      data: { ref: project.ref, orgSlug, name, password, account: conn.label || conn.orgName },
    };
  } catch (err) {
    await addLog(session.tenantId, { user: session.email, action: "criar_projeto", target: name, ok: false, detail: String(err) });
    return fail(err);
  }
}

// ---------- contas ----------

export async function renameConnectionAction(orgSlug: string, label: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setConnectionFields(session.tenantId, orgSlug, { label: label.trim() || undefined });
    revalidatePath("/", "layout");
    return { ok: true, message: "Nome atualizado." };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectAction(orgSlug: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const conn = await connectionOrThrow(session.tenantId, orgSlug);
    await deleteConnection(session.tenantId, orgSlug);
    // Org de login por Access Token: lembra para a sincronização não trazê-la de volta.
    if (conn.authKind === "pat" && conn.login) {
      const login = await getPatLogin(session.tenantId, conn.login);
      if (login) await putPatLogin(session.tenantId, { ...login, ignored: [...new Set([...(login.ignored ?? []), orgSlug])] });
    }
    await addLog(session.tenantId, { user: session.email, action: "desconectar_conta", target: conn.orgName, ok: true });
    revalidatePath("/", "layout");
    return { ok: true, message: `"${conn.label || conn.orgName}" foi desconectada do painel. Nada foi apagado no Supabase.` };
  } catch (err) {
    return fail(err);
  }
}

// ---------- login por Access Token (todas as organizações de uma conta) ----------

export async function connectPatAction(
  _prev: ActionResult<{ email: string; added: string[]; total: number }> | null,
  form: FormData,
): Promise<ActionResult<{ email: string; added: string[]; total: number }>> {
  const session = await requireSession();
  const token = String(form.get("token") ?? "").trim();
  if (!token) return { ok: false, message: "Cole o Access Token." };
  if (!token.startsWith("sbp_")) {
    return { ok: false, message: "Isso não parece um Access Token do Supabase. Ele começa com sbp_ e é gerado em Account → Access Tokens." };
  }
  const rl = await rateLimit(session.tenantId, "connect", 10, 300);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  try {
    const profile = await getProfileWithToken(token).catch((err) => {
      throw err instanceof SupabaseApiError && err.status === 401
        ? new Error("O Supabase recusou esse token. Ele pode ter sido apagado, expirado ou copiado incompleto.")
        : err;
    });
    const email = profile.primary_email.toLowerCase();
    const existing = await getPatLogin(session.tenantId, email);
    const login = {
      email,
      token: encrypt(token),
      createdAt: new Date().toISOString(), // nova versão: sincronização regrava as orgs com o token novo
      connectedBy: session.email,
      ignored: existing?.ignored,
    };
    await putPatLogin(session.tenantId, login);
    const budget = await orgBudget(session.tenantId);
    const { added, total } = await syncPatLogin(session.tenantId, login, session.email, budget);
    const blocked = budget.blocked.length
      ? ` ${budget.blocked.length} organização(ões) ficaram de fora pelo limite do plano Grátis (${budget.blocked.join(", ")}). Faça upgrade para conectar todas.`
      : "";
    await addLog(session.tenantId, {
      user: session.email,
      action: existing ? "atualizar_token" : "conectar_login",
      target: `${email} (${total} organização(ões))`,
      ok: true,
    });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: existing
        ? `Token de ${email} atualizado. ${total - budget.blocked.length} organização(ões) sincronizada(s).${blocked}`
        : `${email} conectado com ${total - budget.blocked.length} organização(ões).${blocked}`,
      data: { email, added, total },
    };
  } catch (err) {
    await addLog(session.tenantId, { user: session.email, action: "conectar_login", target: "token", ok: false, detail: String(err) });
    return fail(err);
  }
}

export async function removeLoginAction(email: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const conns = await connectionsOfLogin(session.tenantId, email);
    await Promise.all(conns.map((c) => deleteConnection(session.tenantId, c.orgSlug)));
    await deletePatLogin(session.tenantId, email);
    await addLog(session.tenantId, { user: session.email, action: "remover_login", target: `${email} (${conns.length} organização(ões))`, ok: true });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `${email} foi removido do Hub. Para invalidar o token de vez, apague-o em supabase.com → Account → Access Tokens.`,
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------- keep-alive ----------

export type KeepAliveResult = ActionResult<{ enabled: boolean; ok?: boolean; lastPingAt?: string; error?: string }>;

/** Liga/desliga o keep-alive de um projeto. Ao ligar, já faz o primeiro ping. */
export async function setKeepAliveAction(orgSlug: string, ref: string, name: string, enabled: boolean): Promise<KeepAliveResult> {
  const a = await gate(orgSlug, ref, "write");
  if (denied(a)) return a;
  try {
    const existing = (await listKeepAlive(a.tenant)).find((k) => k.ref === ref);
    await putKeepAlive({
      ...existing,
      tenantId: a.tenant,
      ref,
      orgSlug,
      name,
      enabled,
      enabledAt: enabled ? new Date().toISOString() : (existing?.enabledAt ?? new Date().toISOString()),
      enabledBy: a.session.email,
    });
    await addLog(a.tenant, { user: actor(a), action: enabled ? "ligar_keepalive" : "desligar_keepalive", target: `${name} (${ref})`, ok: true });

    if (!enabled) {
      revalidatePath("/", "layout");
      return { ok: true, message: `Keep-alive de "${name}" desligado. O Supabase pode pausar após 7 dias sem uso.`, data: { enabled } };
    }
    const ping = await pingProject({ tenantId: a.tenant, orgSlug, ref });
    revalidatePath("/", "layout");
    return ping.ok
      ? { ok: true, message: `"${name}" fica ativo: primeiro ping feito agora, os próximos são diários.`, data: { enabled, ok: true, lastPingAt: new Date().toISOString() } }
      : { ok: false, message: `Keep-alive ligado, mas o primeiro ping falhou: ${ping.error}`, data: { enabled, ok: false, error: ping.error } };
  } catch (err) {
    return fail(err);
  }
}

/** "Pingar agora": um select 1 fora do horário do cron, com cooldown por projeto. */
export async function pingNowAction(
  orgSlug: string,
  ref: string,
  name: string,
): Promise<ActionResult<{ lastPingAt?: string; lastManualPingAt?: string; ok?: boolean; error?: string; availableAt?: number }>> {
  const a = await gate(orgSlug, ref, "write");
  if (denied(a)) return a;
  const rl = await rateLimit(a.session.tenantId, "ping", 20, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  try {
    const existing = (await listKeepAlive(a.tenant)).find((k) => k.ref === ref);
    const availableAt = manualPingAvailableAt(existing?.lastManualPingAt);
    if (availableAt > Date.now()) {
      const mins = Math.ceil((availableAt - Date.now()) / 60000);
      return { ok: false, message: `Já foi pingado há pouco. Disponível de novo em ${mins} min.`, data: { availableAt } };
    }
    const now = new Date().toISOString();
    // grava o horário antes de pingar: cliques repetidos não passam do cooldown
    await putKeepAlive({
      tenantId: a.tenant,
      ref,
      orgSlug,
      name,
      enabled: existing?.enabled ?? false,
      enabledAt: existing?.enabledAt ?? now,
      enabledBy: existing?.enabledBy ?? a.session.email,
      lastPingAt: existing?.lastPingAt,
      lastOk: existing?.lastOk,
      lastError: existing?.lastError,
      lastManualPingAt: now,
    });
    const ping = await pingProject({ tenantId: a.tenant, orgSlug, ref });
    revalidatePath("/", "layout");
    return ping.ok
      ? { ok: true, message: `Ping feito em "${name}". A contagem de 7 dias recomeçou agora.`, data: { ok: true, lastPingAt: now, lastManualPingAt: now } }
      : { ok: false, message: `O ping falhou: ${ping.error}`, data: { ok: false, error: ping.error, lastPingAt: now, lastManualPingAt: now } };
  } catch (err) {
    return fail(err);
  }
}

/** Liga o keep-alive em todos os projetos no ar que ainda não têm. */
export async function enableKeepAliveForAllAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const { projects } = await loadHub(session.tenantId);
    const targets = projects.filter((p) => !p.keepAlive?.enabled && (p.status === "ACTIVE_HEALTHY" || p.status === "ACTIVE_UNHEALTHY"));
    if (!targets.length) return { ok: true, message: "Todos os projetos no ar já estão com keep-alive." };

    const now = new Date().toISOString();
    const results = await mapLimit(targets, 6, async (p) => {
      await putKeepAlive({ tenantId: session.tenantId, ref: p.ref, orgSlug: p.accountSlug, name: p.name, enabled: true, enabledAt: now, enabledBy: session.email });
      return pingProject({ tenantId: session.tenantId, orgSlug: p.accountSlug, ref: p.ref });
    });
    const failed = results.filter((r) => !r.ok).length;
    await addLog(session.tenantId, { user: session.email, action: "ligar_keepalive", target: `${targets.length} projeto(s) de uma vez`, ok: failed === 0 });
    revalidatePath("/", "layout");
    return {
      ok: failed === 0,
      message: failed
        ? `Keep-alive ligado em ${targets.length} projeto(s); ${failed} ping(s) falharam. Veja a coluna Manter ativo.`
        : `Keep-alive ligado em ${targets.length} projeto(s), com o primeiro ping feito agora.`,
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------- conexão / senha ----------

export async function revealPasswordAction(
  orgSlug: string,
  ref: string,
): Promise<ActionResult<{ password: string | null; source?: string; updatedAt?: string }>> {
  const a = await gate(orgSlug, ref, "secrets");
  if (denied(a)) return a;
  const stored = await getPassword(a.tenant, ref);
  if (!stored) return { ok: true, message: "", data: { password: null } };
  await addLog(a.tenant, { user: actor(a), action: "ver_senha", target: ref, ok: true });
  return {
    ok: true,
    message: "",
    data: { password: decrypt(stored.password), source: stored.source, updatedAt: stored.updatedAt },
  };
}

export async function resetPasswordAction(orgSlug: string, ref: string, newPassword?: string): Promise<ActionResult<{ password: string }>> {
  const a = await gate(orgSlug, ref, "manage");
  if (denied(a)) return a;
  const password = newPassword?.trim() || generatePassword();
  if (password.length < 12) return { ok: false, message: "A senha precisa ter pelo menos 12 caracteres." };
  try {
    await clientFor(a.conn).updatePassword(ref, password);
    await putPassword(a.tenant, ref, encrypt(password), "reset");
    await addLog(a.tenant, { user: actor(a), action: "redefinir_senha", target: ref, ok: true });
    return { ok: true, message: "Senha redefinida. Atualize as aplicações que usam a senha antiga.", data: { password } };
  } catch (err) {
    await addLog(a.tenant, { user: actor(a), action: "redefinir_senha", target: ref, ok: false, detail: String(err) });
    return fail(err);
  }
}

export async function saveKnownPasswordAction(orgSlug: string, ref: string, password: string): Promise<ActionResult> {
  const a = await gate(orgSlug, ref, "secrets");
  if (denied(a)) return a;
  if (!password.trim()) return { ok: false, message: "Digite a senha." };
  try {
    // Valida contra o banco antes de guardar (prevenção de erro).
    const conn = a.conn;
    const pooler = (await clientFor(conn).getPooler(ref)).find((p) => p.database_type === "PRIMARY");
    if (pooler) {
      {
        const client = new Client({
          host: pooler.db_host,
          port: 5432,
          user: pooler.db_user,
          database: pooler.db_name,
          password: password.trim(),
          // TLS verificado contra a CA raiz do Supabase (sem MITM silencioso)
          ssl: { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true, servername: pooler.db_host },
          connectionTimeoutMillis: 8000,
        });
        try {
          await client.connect();
          await client.query("select 1");
        } catch {
          return { ok: false, message: "Essa senha não conectou no banco. Confira e tente de novo." };
        } finally {
          await client.end().catch(() => {});
        }
      }
    }
    await putPassword(a.tenant, ref, encrypt(password.trim()), "manual");
    await addLog(a.tenant, { user: actor(a), action: "salvar_senha", target: ref, ok: true });
    return { ok: true, message: "Senha verificada e guardada (criptografada)." };
  } catch (err) {
    return fail(err);
  }
}

export async function revealApiKeysAction(orgSlug: string, ref: string): Promise<ActionResult<{ name: string; type: string; key: string }[]>> {
  const a = await gate(orgSlug, ref, "secrets");
  if (denied(a)) return a;
  try {
    const keys = await clientFor(a.conn).getApiKeys(ref);
    await addLog(a.tenant, { user: actor(a), action: "ver_chaves_api", target: ref, ok: true });
    return {
      ok: true,
      message: "",
      data: keys
        .filter((k) => k.api_key)
        .map((k) => ({ name: k.name, type: k.type ?? "legacy", key: k.api_key! })),
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------- SQL / tabelas ----------

export type QueryResult = { columns: string[]; rows: Record<string, unknown>[]; ms: number };

export async function runSqlAction(orgSlug: string, ref: string, sql: string, readOnly: boolean): Promise<ActionResult<QueryResult>> {
  // escrita exige Editor; leitura, qualquer papel
  const a = await gate(orgSlug, ref, readOnly ? "view" : "write");
  if (denied(a)) return a;
  if (!sql.trim()) return { ok: false, message: "Escreva um comando SQL." };
  const rl = await rateLimit(a.session.tenantId, "sql", 60, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const started = Date.now();
  try {
    const rows = (await clientFor(a.conn).query(ref, sql, { readOnly })) ?? [];
    const ms = Date.now() - started;
    if (!readOnly) {
      await addLog(a.tenant, { user: actor(a), action: "executar_sql", target: ref, ok: true, detail: sql.slice(0, 500) });
    }
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { ok: true, message: `${rows.length} linha(s) em ${ms} ms.`, data: { columns, rows: rows.slice(0, 1000), ms } };
  } catch (err) {
    if (!readOnly) {
      await addLog(a.tenant, { user: actor(a), action: "executar_sql", target: ref, ok: false, detail: `${sql.slice(0, 300)} → ${String(err)}` });
    }
    return fail(err);
  }
}

function ident(name: string) {
  return '"' + name.replace(/"/g, '""') + '"';
}

export async function tableRowsAction(
  orgSlug: string,
  ref: string,
  schema: string,
  table: string,
  page: number,
): Promise<ActionResult<QueryResult & { columnTypes: Record<string, string> }>> {
  const a = await gate(orgSlug, ref, "view");
  if (denied(a)) return a;
  const rl = await rateLimit(a.session.tenantId, "tables", 120, 60);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const pageSize = 50;
  const started = Date.now();
  try {
    const api = clientFor(a.conn);
    const cols = await api.query<{ column_name: string; data_type: string }>(
      ref,
      "select column_name, data_type from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position",
      { readOnly: true, parameters: [schema, table] },
    );
    if (!cols.length) return { ok: false, message: "Tabela não encontrada ou sem colunas visíveis." };
    const rows = await api.query(
      ref,
      `select * from ${ident(schema)}.${ident(table)} limit ${pageSize} offset ${Math.max(0, page) * pageSize}`,
      { readOnly: true },
    );
    return {
      ok: true,
      message: "",
      data: {
        columns: cols.map((c) => c.column_name),
        columnTypes: Object.fromEntries(cols.map((c) => [c.column_name, c.data_type])),
        rows,
        ms: Date.now() - started,
      },
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------- assinatura (AbacatePay) ----------

export async function cancelSubscriptionAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const billing = await getBilling(session.tenantId);
    if (!billing.subscriptionId || billing.subscriptionStatus === "CANCELLED") {
      return { ok: false, message: "Não há assinatura ativa para cancelar." };
    }
    await cancelSubscription(billing.subscriptionId);
    // o Pro continua até o fim do período pago (until não muda); o webhook confirma depois
    await updateBilling(session.tenantId, { subscriptionStatus: "CANCELLED" });
    await addLog(session.tenantId, { user: session.email, action: "assinatura_cancelada", target: billing.subscriptionId, ok: true });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: billing.until
        ? `Assinatura cancelada. O Pro continua até ${new Date(billing.until).toLocaleDateString("pt-BR")}.`
        : "Assinatura cancelada.",
    };
  } catch (err) {
    await addLog(session.tenantId, { user: session.email, action: "assinatura_cancelada", target: "?", ok: false, detail: String(err) });
    return fail(err);
  }
}

// ---------- MCP ----------

export async function saveMcpConfigAction(config: McpConfig): Promise<ActionResult> {
  const session = await requireSession();
  const plan = (await orgUsage(session.tenantId)).plan;
  if (!hasMcp(plan)) return { ok: false, message: "O MCP é do plano Business." };
  await setMcpConfig(session.tenantId, config);
  await addLog(session.tenantId, { user: session.email, action: "config_mcp", target: `${config.globalTools.length} ações globais`, ok: true });
  revalidatePath("/mcp");
  return { ok: true, message: "Configuração do MCP salva." };
}

// ---------- descrição do banco (IA ou manual) ----------

export type DescriptionDraft = { text: string; doubts: string[]; usedTables: number; totalTables: number };

/** Rascunhos por versão do esquema (o 1º, "Gerar de novo" e "Usar mais tabelas" somam). */
const DRAFTS_PER_SCHEMA = 3;

/**
 * Gera um RASCUNHO com IA a partir do esquema. Não salva nada: o usuário revisa antes.
 * Controle de custo (tudo no servidor, checado ANTES de chamar a IA):
 * - só com motivo: banco sem descrição ou esquema diferente da última descrição salva;
 * - até 3 rascunhos por versão do esquema;
 * - 5/hora e 15/dia por usuário; teto diário geral somando todos (AI_DAILY_DESCRIBE_LIMIT).
 */
export async function generateDescriptionAction(
  orgSlug: string,
  ref: string,
  opts: { includeSamples: boolean; depth: "normal" | "ampla" },
): Promise<ActionResult<DescriptionDraft & { remaining: number }>> {
  const a = await gate(orgSlug, ref, "write");
  if (denied(a)) return a;
  const session = a.session;
  if (!env.aiEnabled) return { ok: false, message: "A IA está desligada nesta instalação (defina ANTHROPIC_API_KEY)." };
  try {
    const conn = a.conn;
    // leitura do esquema: sem IA, sem token
    const [project, snap, previous, gen] = await Promise.all([
      clientFor(conn).getProject(ref),
      schemaSnapshot(conn, ref),
      getDescription(a.tenant, ref),
      getDescribeCount(a.tenant, ref),
    ]);
    if (previous?.fingerprint && previous.fingerprint === snap.fingerprint)
      return { ok: false, message: "Nenhuma tabela ou coluna mudou desde a última descrição. Se quiser ajustar o texto, use Editar." };
    const used = gen?.fingerprint === snap.fingerprint ? gen.count : 0;
    if (used >= DRAFTS_PER_SCHEMA)
      return {
        ok: false,
        message: `Já foram gerados ${DRAFTS_PER_SCHEMA} rascunhos para esta versão do banco. Edite à mão; a IA volta a ficar disponível quando o esquema mudar.`,
      };

    for (const [scope, action, limit, window] of [
      [session.tenantId, "describe", 5, 3600],
      [session.tenantId, "describe-day", 15, 86400],
      ["GLOBAL", "describe-day", env.aiGlobalDailyDescribe, 86400],
    ] as const) {
      const rl = await rateLimit(scope, action, limit, window);
      if (!rl.ok)
        return scope === "GLOBAL"
          ? { ok: false, message: "O limite diário de descrições com IA foi atingido. Tente amanhã ou escreva à mão." }
          : tooMany(rl.retryAfterSec);
    }

    await putDescribeCount(a.tenant, ref, snap.fingerprint, used + 1);
    const diff = previous ? diffSchema(previous.tables, snap.tables) : undefined;
    const draft = await generateDraft(conn, project, snap, { ...opts, previous, diff });
    await addLog(a.tenant, {
      user: actor(a),
      action: "descrever_banco",
      target: `${project.name} (${ref})`,
      ok: true,
      detail: `${draft.usedTables} de ${draft.totalTables} tabelas${opts.includeSamples ? ", com linhas de exemplo" : ""}`,
    });
    return { ok: true, message: "Rascunho pronto. Revise antes de salvar.", data: { ...draft, remaining: DRAFTS_PER_SCHEMA - used - 1 } };
  } catch (err) {
    await addLog(a.tenant, { user: actor(a), action: "descrever_banco", target: ref, ok: false, detail: String(err) });
    return fail(err);
  }
}

/** Salva a descrição revisada (texto vazio apaga) e registra o esquema atual. */
export async function saveDescriptionAction(orgSlug: string, ref: string, text: string, source: "ai" | "manual"): Promise<ActionResult> {
  const a = await gate(orgSlug, ref, "write");
  if (denied(a)) return a;
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length > 2000) return { ok: false, message: "Use até 2000 caracteres." };
  try {
    if (!clean) {
      await deleteDescription(a.tenant, ref);
      revalidatePath(`/p/${orgSlug}/${ref}`);
      return { ok: true, message: "Descrição removida." };
    }
    const conn = a.conn;
    // banco pausado: salva sem impressão digital (o aviso de mudança volta quando ele estiver no ar)
    const snap = await schemaSnapshot(conn, ref).catch(() => null);
    await putDescription(a.tenant, {
      ref,
      text: clean,
      fingerprint: snap?.fingerprint,
      tables: snap?.tables,
      source,
      updatedAt: new Date().toISOString(),
      updatedBy: a.session.email,
    });
    await addLog(a.tenant, { user: actor(a), action: "salvar_descricao", target: ref, ok: true });
    revalidatePath(`/p/${orgSlug}/${ref}`);
    return { ok: true, message: "Descrição salva. O MCP já usa este texto." };
  } catch (err) {
    return fail(err);
  }
}
