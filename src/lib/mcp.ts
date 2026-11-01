import "server-only";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomInt } from "node:crypto";
import { awsClientConfig } from "./aws";
import { decrypt, encrypt } from "./crypto";
import {
  addLog,
  deleteKeepAlive,
  deletePassword,
  getConnection,
  getDescription,
  getPatLogin,
  listDescriptions,
  listConnections,
  putConnection,
  putPassword,
} from "./db";
import { env } from "./env";
import { loadHub } from "./hub";
import { hasMcp, orgUsage } from "./plans";
import { schemaSnapshot } from "./describe";
import { mcpForMember, ROLE_LABEL } from "./roles";
import { getSharedWithMe, listSharedWithMe, type SharedWithMe } from "./shares";
import { COUNTS_AS_ACTIVE, FREE_PLAN_ACTIVE_LIMIT } from "./status";
import { clientFor, createOrgWithToken, PAT_EXPIRES_AT, type Project } from "./supabase-api";

// Config e índice do MCP no DynamoDB:
//   pk=T#<tenant>  sk=MCPCFG     { enabledTools: string[], scope: "all" | string[] }
//   pk=T#<tenant>  sk=MCPREFIDX  { map: { ref -> orgSlug }, ttl }

const doc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()), {
  marshallOptions: { removeUndefinedValues: true },
});

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[] };

export type McpTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  /** Agrupamento na tela de config. */
  group: "leitura" | "escrita" | "ciclo" | "conta";
  destructive?: boolean;
  /** Só uma permissão (liga/desliga algo de outra ação), não vira ferramenta no MCP. Vale por banco. */
  permissionOnly?: boolean;
};

/** Permissão que deixa o run_sql alterar o banco (read_only=false). */
export const SQL_WRITE = "sql_write";

const str = (description: string) => ({ type: "string", description });

// Catálogo completo. A tela de config liga/desliga cada um; o scope limita os bancos.
export const CATALOG: McpTool[] = [
  { name: "list_projects", group: "leitura", description: "Lista seus bancos liberados, com estado e região.", inputSchema: { type: "object", properties: {} } },
  { name: "list_orgs", group: "leitura", description: "Mapa das organizações: plano, bancos (ligados/pausados) e quais têm vaga livre para um banco grátis.", inputSchema: { type: "object", properties: {} } },
  { name: "get_project", group: "leitura", description: "Detalhes de um projeto (estado, região, Postgres).", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "list_tables", group: "leitura", description: "Lista as tabelas de um banco.", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "table_rows", group: "leitura", description: "Lê linhas de uma tabela (50 por página).", inputSchema: { type: "object", properties: { project_ref: str("ref"), schema: str("schema"), table: str("tabela"), page: { type: "integer", description: "página (0+)" } }, required: ["project_ref", "schema", "table"] } },
  { name: "run_sql", group: "leitura", description: "Roda SQL de leitura (SELECT). Para alterar dados, ligue também \"SQL de escrita\".", inputSchema: { type: "object", properties: { project_ref: str("ref"), query: str("SQL"), read_only: { type: "boolean", description: "somente leitura (padrão true)" } }, required: ["project_ref", "query"] } },
  { name: SQL_WRITE, group: "escrita", permissionOnly: true, destructive: true, description: "Permite que o run_sql altere o banco (INSERT, UPDATE, DELETE, DROP...). Desligado, o servidor só aceita SQL de leitura, mesmo que o assistente peça para escrever.", inputSchema: { type: "object", properties: {} } },
  { name: "connection_strings", group: "leitura", description: "Connection strings do banco (dado sensível).", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "ping_project", group: "ciclo", description: "Ping (select 1) para o banco não pausar.", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "restore_project", group: "ciclo", description: "Reativa um banco pausado.", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "pause_project", group: "ciclo", description: "Pausa um banco.", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "create_project", group: "conta", description: "Cria um banco novo. Sem 'organization', ele lista as orgs com vaga e pede para escolher (não cria). Use organization=\"auto\" para qualquer uma com vaga.", inputSchema: { type: "object", properties: { name: str("nome do banco"), region: str("região, ex. sa-east-1"), organization: str("slug da org, ou \"auto\" para qualquer uma com vaga; vazio lista as livres"), allow_duplicate_name: { type: "boolean", description: "criar mesmo se já houver um banco com esse nome na org (padrão false)" } }, required: ["name", "region"] } },
  { name: "delete_project", group: "conta", destructive: true, description: "EXCLUI um banco e todos os dados. Irreversível.", inputSchema: { type: "object", properties: { project_ref: str("ref do projeto") }, required: ["project_ref"] } },
  { name: "create_org", group: "conta", description: "Cria uma organização num login por Access Token.", inputSchema: { type: "object", properties: { login_email: str("e-mail do login"), name: str("nome da org") }, required: ["login_email", "name"] } },
];

const BY_NAME = new Map(CATALOG.map((t) => [t.name, t]));

export type McpConfig = {
  /** Ações liberadas por padrão em todos os bancos. */
  globalTools: string[];
  /** Override por banco (ref -> ações); substitui o global naquele banco. */
  perDb: Record<string, string[]>;
};

const DEFAULT_GLOBAL = ["list_projects", "list_orgs", "get_project", "list_tables", "table_rows", "run_sql"];
const DEFAULT_CONFIG: McpConfig = { globalTools: DEFAULT_GLOBAL, perDb: {} };

/** Ações válidas para um banco: o override do banco, ou o global. */
export function toolsForDb(cfg: McpConfig, ref: string): string[] {
  return cfg.perDb[ref] ?? cfg.globalTools;
}

export async function getMcpConfig(tenant: string): Promise<McpConfig> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: { pk: `T#${tenant}`, sk: "MCPCFG" } }));
  if (!out.Item) return DEFAULT_CONFIG;
  // compat: config antiga tinha enabledTools/scope
  const globalTools: string[] = out.Item.globalTools ?? out.Item.enabledTools ?? DEFAULT_GLOBAL;
  const perDb: Record<string, string[]> = out.Item.perDb ?? {};
  return { globalTools, perDb };
}

export async function setMcpConfig(tenant: string, cfg: McpConfig) {
  const clean = (names: string[]) => names.filter((n) => BY_NAME.has(n));
  const globalTools = clean(cfg.globalTools);
  const perDb: Record<string, string[]> = {};
  for (const [ref, names] of Object.entries(cfg.perDb ?? {})) perDb[ref] = clean(names);
  await doc.send(new PutCommand({ TableName: env.table, Item: { pk: `T#${tenant}`, sk: "MCPCFG", globalTools, perDb } }));
}

/** Ferramentas que este tenant pode usar AGORA (plano Business + config). */
export async function allowedTools(tenant: string): Promise<McpTool[]> {
  const [plan, cfg] = await Promise.all([orgUsage(tenant).then((u) => u.plan), getMcpConfig(tenant)]);
  if (!hasMcp(plan)) return [];
  const union = new Set([...cfg.globalTools, ...Object.values(cfg.perDb).flat()]);
  return CATALOG.filter((t) => !t.permissionOnly && union.has(t.name));
}

export class McpError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}

// ---------- resolução + conferência do banco ----------

type Conn = Awaited<ReturnType<typeof listConnections>>[number];
type Resolved = { conn: Conn; project: Project; /** banco compartilhado com este usuário (conexão do dono) */ shared?: SharedWithMe };

const REFIDX_KEY = (tenant: string) => ({ pk: `T#${tenant}`, sk: "MCPREFIDX" });

async function cachedOrgForRef(tenant: string, ref: string): Promise<string | null> {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: REFIDX_KEY(tenant) }));
  const map: Record<string, string> = out.Item?.map ?? {};
  return map[ref] ?? null;
}

async function rememberRefOrg(tenant: string, ref: string, org: string) {
  const out = await doc.send(new GetCommand({ TableName: env.table, Key: REFIDX_KEY(tenant) }));
  const map: Record<string, string> = { ...(out.Item?.map ?? {}), [ref]: org };
  await doc.send(new PutCommand({ TableName: env.table, Item: { ...REFIDX_KEY(tenant), map, ttl: Math.floor(Date.now() / 1000) + 3600 } }));
}

/**
 * Confirma, AO VIVO, que o ref existe mesmo numa conta conectada deste tenant e
 * devolve a conexão certa + o projeto. Não confia só no cache: lista os projetos
 * da org (começando pela dica do cache) e só age se o ref bater de verdade.
 * Assim o MCP nunca aplica uma ação no banco errado por causa de índice velho.
 */
async function resolveProject(tenant: string, ref: string): Promise<Resolved> {
  if (!ref) throw new McpError("Informe o ref do projeto.", 422);

  const conns = await listConnections(tenant);

  // tenta primeiro a org que o cache sugere, depois as demais
  const hint = await cachedOrgForRef(tenant, ref);
  const ordered = hint ? [...conns].sort((a, b) => Number(b.orgSlug === hint) - Number(a.orgSlug === hint)) : conns;

  let hadUnreachable = false;
  for (const conn of ordered) {
    let projects: Project[];
    try {
      projects = await clientFor(conn).listProjects();
    } catch {
      hadUnreachable = true; // conta com token inválido/caiu: tenta a próxima, mas lembra
      continue;
    }
    // Ignora REMOVED: um ref de banco já excluído não deve casar.
    const project = projects.find((p) => p.ref === ref && p.organization_slug === conn.orgSlug && p.status !== "REMOVED");
    if (project) {
      if (hint !== conn.orgSlug) await rememberRefOrg(tenant, ref, conn.orgSlug).catch(() => {});
      return { conn, project };
    }
  }
  // Banco compartilhado por outra conta: usa a conexão do dono, conferindo ao vivo também.
  const sh = await getSharedWithMe(tenant, ref);
  if (sh) {
    const conn = await getConnection(sh.ownerTenant, sh.orgSlug);
    if (!conn) throw new McpError(`O banco "${sh.projectName}" foi compartilhado com você, mas o dono desconectou a conta dele.`, 409);
    const project = (await clientFor(conn).listProjects()).find((p) => p.ref === ref && p.organization_slug === sh.orgSlug && p.status !== "REMOVED");
    if (!project) throw new McpError(`O banco "${sh.projectName}" não existe mais na conta do dono.`, 404);
    return { conn, project, shared: sh };
  }
  // Se alguma conta não respondeu, o ref pode estar lá: não afirme "não existe".
  if (hadUnreachable)
    throw new McpError(`Não encontrei o banco "${ref}" e uma ou mais contas não responderam (token pode precisar reconectar). Rode list_orgs para conferir.`, 409);
  throw new McpError(`Banco "${ref}" não encontrado nas suas contas conectadas. Confira o ref com list_projects.`, 404);
}

// Supabase Free: 2 bancos ATIVOS por E-MAIL (login), somando todas as organizações
// Free daquele login. Org paga não tem esse teto. A conta é a mesma do painel (loadHub).

type OrgInfo = {
  slug: string;
  name: string;
  /** e-mail do login Supabase dono da org (sem e-mail: a org conta sozinha) */
  login?: string;
  paid: boolean;
  reachable: boolean;
  /** projetos não removidos da org */
  projects: Project[];
  /** bancos ligados nesta org */
  active: number;
  /** ligados em orgs Free do mesmo e-mail (o que conta para o limite) */
  loginActive: number;
  /** vagas grátis livres do E-MAIL (null = org paga, sem teto) */
  loginFree: number | null;
  hasFreeSlot: boolean;
  /** donos/admins no limite que impedem criar aqui */
  blockedBy?: string[];
};

/** Mapa de todas as orgs conectadas, com bancos e vaga livre (vaga calculada por e-mail). */
async function mapOrgs(tenant: string): Promise<OrgInfo[]> {
  const { accounts, logins } = await loadHub(tenant);
  const byLogin = new Map(logins.map((l) => [l.login ?? `org:${l.orgSlugs[0]}`, l]));
  return accounts.map((a): OrgInfo => {
    const summary = byLogin.get(a.login ?? `org:${a.orgSlug}`);
    const paid = !!a.plan && a.plan.toLowerCase() !== "free";
    return {
      slug: a.orgSlug,
      name: a.name,
      login: a.login,
      paid,
      reachable: !a.error,
      projects: a.projects,
      active: a.activeCount,
      loginActive: summary?.activeFree ?? a.activeCount,
      loginFree: paid ? null : a.freeSlots,
      hasFreeSlot: !a.error && (paid || (a.freeSlots ?? 0) > 0),
      blockedBy: a.blockedBy,
    };
  });
}

/** "e-mail · 1 de 2 ligados · 1 vaga" (ou "pago, sem limite") */
function slotLabel(o: OrgInfo): string {
  if (o.paid) return "org paga, sem limite de bancos grátis";
  const who = o.login ?? "e-mail não identificado";
  const free = o.loginFree ?? 0;
  return `${who} · ${o.loginActive} de ${FREE_PLAN_ACTIVE_LIMIT} ligados no e-mail · ${free ? `${free} vaga${free > 1 ? "s" : ""}` : "sem vaga"}`;
}

const TABLES_SQL = `select n.nspname as schema, c.relname as name, c.reltuples::bigint as rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as size, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema','pg_toast')
order by (n.nspname='public') desc, n.nspname, c.relname`;

const ident = (name: string) => '"' + name.replace(/"/g, '""') + '"';

/** Executa uma ação. Retorna o conteúdo (texto) ou lança McpError. */
export async function executeTool(tenant: string, email: string, name: string, args: Record<string, unknown>): Promise<string> {
  const tool = BY_NAME.get(name);
  if (!tool || tool.permissionOnly) throw new McpError(`Ação "${name}" não existe.`, 404);
  const cfg = await getMcpConfig(tenant);
  const ref = String(args.project_ref ?? "");
  // ações com banco: valem as ações daquele banco (override ou global); sem banco: o global
  const allowedHere = ref ? toolsForDb(cfg, ref) : cfg.globalTools;
  if (!allowedHere.includes(name)) throw new McpError(`Ação "${name}" não está habilitada para este banco.`, 404);

  // Resolve o banco e, se for compartilhado, aplica o que o dono/Admin liberou para esta pessoa.
  const resolve = async (): Promise<Resolved> => {
    const r = await resolveProject(tenant, ref);
    if (r.shared) {
      const allowed = mcpForMember(r.shared.role, r.shared.mcpTools);
      if (!allowed.includes(name))
        throw new McpError(`Quem compartilhou "${r.project.name}" não liberou a ação "${name}" para você neste banco.`, 403);
      const writing = name === "run_sql" && args.read_only === false;
      if (writing && !allowed.includes(SQL_WRITE))
        throw new McpError(`SQL de escrita não foi liberado para você em "${r.project.name}". Só consultas (read_only=true).`, 403);
      // o dono vê no histórico tudo que um convidado altera ou lê de sensível via MCP
      if (writing || ["connection_strings", "ping_project", "restore_project", "pause_project"].includes(name))
        await addLog(r.shared.ownerTenant, {
          user: `${email} (convidado, ${r.shared.role})`,
          action: writing ? "executar_sql" : `mcp_${name}`,
          target: ref,
          ok: true,
          detail: writing ? `via MCP: ${String(args.query ?? "").slice(0, 400)}` : "via MCP",
        }).catch(() => {});
    }
    return r;
  };

  switch (name) {
    case "list_projects": {
      const [conns, descs] = await Promise.all([listConnections(tenant), listDescriptions(tenant)]);
      const descOf = new Map(descs.map((d) => [d.ref, d.text]));
      const rows = (
        await Promise.all(
          conns.map(async (c) => {
            try {
              const ps = await clientFor(c).listProjects();
              return ps
                // bloqueado (override vazio) não aparece para o assistente
                .filter((p) => p.organization_slug === c.orgSlug && p.status !== "REMOVED" && cfg.perDb[p.ref]?.length !== 0)
                .map((p) => {
                  const d = descOf.get(p.ref);
                  return `- ${p.name} (${p.ref}) · ${p.status} · ${p.region} · org ${c.orgSlug}${d ? `\n  sobre: ${d.replace(/\s+/g, " ").slice(0, 240)}` : ""}`;
                });
            } catch {
              return [];
            }
          }),
        )
      ).flat();
      // bancos compartilhados comigo (lidos com a conexão do dono)
      const sharedRows = await Promise.all(
        (await listSharedWithMe(tenant))
          .filter((sh) => cfg.perDb[sh.ref]?.length !== 0)
          .map(async (sh) => {
            try {
              const conn = await getConnection(sh.ownerTenant, sh.orgSlug);
              if (!conn) return null;
              const [p, desc] = await Promise.all([clientFor(conn).getProject(sh.ref), getDescription(sh.ownerTenant, sh.ref)]);
              const sobre = desc ? `\n  sobre: ${desc.text.replace(/\s+/g, " ").slice(0, 240)}` : "";
              return `- ${p.name} (${p.ref}) · ${p.status} · ${p.region} · compartilhado por ${sh.ownerEmail} (papel ${ROLE_LABEL[sh.role]})${sobre}`;
            } catch {
              return null;
            }
          }),
      );
      rows.push(...sharedRows.filter((x): x is string => Boolean(x)));
      return rows.length ? rows.join("\n") : "Nenhum banco liberado.";
    }
    case "list_orgs": {
      const orgs = await mapOrgs(tenant);
      if (!orgs.length) return "Nenhuma organização conectada.";
      // agrupado por e-mail: o limite de 2 bancos grátis ligados é do e-mail, não da org
      const groups = new Map<string, OrgInfo[]>();
      for (const o of orgs) {
        const key = o.login ?? `(e-mail não identificado: ${o.slug})`;
        groups.set(key, [...(groups.get(key) ?? []), o]);
      }
      const out = [`Regra do Supabase Free: cada PESSOA (e-mail) dona ou admin pode ter ${FREE_PLAN_ACTIVE_LIMIT} bancos grátis ligados, somando todas as orgs Free em que tem esse papel; uma org só tem vaga se todos os donos/admins dela estiverem abaixo do limite. Org paga não conta.`];
      for (const [login, list] of groups) {
        const free = list.find((o) => !o.paid && o.reachable);
        const header = free
          ? `${login} · ${free.loginActive} de ${FREE_PLAN_ACTIVE_LIMIT} ligados · ${free.loginFree ? `${free.loginFree} vaga(s) grátis` : "sem vaga grátis"}`
          : `${login}`;
        out.push(`\n${header}`);
        for (const o of list) {
          const status = !o.reachable ? "inalcançável (reconecte em Contas)" : o.paid ? "org paga, sem limite" : "org grátis";
          out.push(`  ${o.name} (${o.slug}) · ${status} · ${o.active} ligado(s) nesta org${o.blockedBy?.length ? ` · SEM VAGA: ${o.blockedBy.join(", ")} no limite` : ""}`);
          out.push(o.projects.length ? o.projects.map((p) => `    · ${p.name} (${p.ref}) ${p.status}`).join("\n") : "    · (nenhum banco)");
        }
      }
      return out.join("\n");
    }
    case "get_project": {
      const { conn, project, shared } = await resolve();
      const [p, desc] = await Promise.all([clientFor(conn).getProject(ref), getDescription(shared?.ownerTenant ?? tenant, ref)]);
      let sobre = "sobre: (sem descrição; peça ao usuário para descrever o banco no BaseHub)";
      if (desc) {
        // confere se o esquema mudou desde a descrição (sem IA, só o hash das tabelas)
        const snap = desc.fingerprint && COUNTS_AS_ACTIVE.has(p.status) ? await schemaSnapshot(conn, ref).catch(() => null) : null;
        const old = snap && snap.fingerprint !== desc.fingerprint ? " (pode estar desatualizada: tabelas ou colunas mudaram depois)" : "";
        sobre = `sobre${old}: ${desc.text}`;
      }
      return `${p.name} (${p.ref})\norg: ${project.organization_slug}\nestado: ${p.status}\nregião: ${p.region}\nPostgres: ${p.database?.version ?? "?"}\n${sobre}`;
    }
    case "list_tables": {
      const { conn, project } = await resolve();
      const rows = await clientFor(conn).query<{ schema: string; name: string; rows: number; size: string; rls: boolean }>(ref, TABLES_SQL, { readOnly: true });
      const body = rows.map((r) => `${r.schema}.${r.name} · ~${r.rows} linhas · ${r.size} · RLS ${r.rls ? "on" : "off"}`).join("\n") || "Sem tabelas.";
      return `Banco: ${project.name} (${ref})\n${body}`;
    }
    case "table_rows": {
      const { conn } = await resolve();
      const page = Math.max(0, Number(args.page ?? 0));
      const rows = await clientFor(conn).query(ref, `select * from ${ident(String(args.schema))}.${ident(String(args.table))} limit 50 offset ${page * 50}`, { readOnly: true });
      return JSON.stringify(rows, null, 2);
    }
    case "run_sql": {
      const { conn, project } = await resolve();
      const readOnly = args.read_only !== false;
      // escrita só com a permissão "SQL de escrita" ligada para este banco
      if (!readOnly && !allowedHere.includes(SQL_WRITE))
        throw new McpError(
          `SQL de escrita está desligado para ${project.name} (${ref}). Só consultas (read_only=true) são aceitas. Para alterar dados, ligue "SQL de escrita" no BaseHub (página MCP).`,
          403,
        );
      const rows = await clientFor(conn).query(ref, String(args.query), { readOnly });
      const header = `-- ${readOnly ? "leitura" : "ESCRITA"} em ${project.name} (${ref})`;
      return `${header}\n${JSON.stringify(rows ?? [], null, 2)}`;
    }
    case "connection_strings": {
      const { conn } = await resolve();
      const poolers = await clientFor(conn).getPooler(ref);
      const stored = await import("./db").then((m) => m.getPassword(tenant, ref));
      const pwd = stored ? decrypt(stored.password) : "[YOUR-PASSWORD]";
      const primary = poolers.find((x) => x.database_type === "PRIMARY");
      const out: string[] = [];
      if (primary) {
        out.push(`pooler (transaction): postgresql://${primary.db_user}:${encodeURIComponent(pwd)}@${primary.db_host}:${primary.db_port}/${primary.db_name}`);
        out.push(`pooler (session): postgresql://${primary.db_user}:${encodeURIComponent(pwd)}@${primary.db_host}:5432/${primary.db_name}`);
      }
      return out.join("\n") || "Sem connection strings.";
    }
    case "ping_project": {
      const { conn, project } = await resolve();
      await clientFor(conn).query(ref, "select 1 as keepalive", { readOnly: true });
      return `Ping ok em ${project.name} (${ref}): a contagem recomeçou.`;
    }
    case "restore_project": {
      const { conn, project } = await resolve();
      await clientFor(conn).restoreProject(ref);
      return `Reativação de ${project.name} (${ref}) iniciada (leva 2 a 5 minutos).`;
    }
    case "pause_project": {
      const { conn, project } = await resolve();
      await clientFor(conn).pauseProject(ref);
      return `Pausando ${project.name} (${ref}).`;
    }
    case "delete_project": {
      const { conn, project } = await resolve();
      await clientFor(conn).deleteProject(ref);
      await Promise.all([deletePassword(tenant, ref).catch(() => {}), deleteKeepAlive(tenant, ref).catch(() => {})]);
      return `Banco ${project.name} (${ref}) excluído no Supabase (irreversível).`;
    }
    case "create_project": {
      const pName = String(args.name ?? "").trim();
      const region = String(args.region ?? "").trim();
      if (!pName || !region) throw new McpError("Informe o nome e a região (region) do banco.", 422);
      const wanted = String(args.organization ?? "").trim();
      const auto = /^(auto|qualquer|qualquer uma|any|livre)$/i.test(wanted);
      const allowDup = args.allow_duplicate_name === true;

      const orgs = await mapOrgs(tenant);
      if (!orgs.length) throw new McpError("Nenhuma organização conectada. Conecte uma conta antes de criar um banco.", 404);
      const freeOrgs = orgs.filter((o) => o.hasFreeSlot);
      // vaga é do e-mail: orgs do mesmo e-mail dividem as mesmas vagas
      const resumoLivres = () =>
        freeOrgs.length
          ? `${freeOrgs.map((o) => `- ${o.name} (${o.slug}) · ${slotLabel(o)}`).join("\n")}\n(Orgs do mesmo e-mail dividem as mesmas vagas.)`
          : "(nenhuma org com vaga livre agora)";

      // Não disse a org (e não é "auto"): lista as com vaga e NÃO cria.
      if (!wanted) {
        if (!freeOrgs.length)
          throw new McpError(
            `Nenhum e-mail tem vaga para um banco grátis agora (limite de ${FREE_PLAN_ACTIVE_LIMIT} ligados por e-mail). Pause ou exclua um banco, use uma org paga, ou conecte outro e-mail.\n${orgs.map((o) => `- ${o.name} (${o.slug}) · ${slotLabel(o)}`).join("\n")}`,
            409,
          );
        return `Não criei nada ainda. Em qual organização? Estas têm vaga livre:\n${resumoLivres()}\n\nChame create_project de novo com organization=<slug>, ou organization="auto" para usar qualquer uma com vaga.`;
      }

      // Resolve a org alvo.
      let target: OrgInfo | undefined;
      if (auto) {
        target = freeOrgs[0];
        if (!target) throw new McpError("Você pediu qualquer org com vaga, mas nenhuma tem vaga agora.", 409);
      } else {
        target = orgs.find((o) => o.slug === wanted || o.name.toLowerCase() === wanted.toLowerCase());
        if (!target) throw new McpError(`Organização "${wanted}" não está conectada.\nConectadas:\n${orgs.map((o) => `- ${o.name} (${o.slug})`).join("\n")}`, 404);
        if (!target.reachable) throw new McpError(`Não consegui falar com a org "${target.name}" (o token pode precisar reconectar).`, 409);
        if (!target.hasFreeSlot)
          throw new McpError(`A org "${target.name}" não tem vaga: o e-mail dela já está no limite (${slotLabel(target)}). Escolha uma com vaga:\n${resumoLivres()}`, 409);
      }

      // Evita banco duplicado pelo nome na mesma org.
      const dup = target.projects.find((p) => p.name.toLowerCase() === pName.toLowerCase());
      if (dup && !allowDup) {
        const dica = dup.status === "INACTIVE" ? ` Ele está pausado: talvez você queira reativar (restore_project "${dup.ref}") em vez de criar outro.` : "";
        throw new McpError(
          `Já existe um banco "${dup.name}" (${dup.ref}, ${dup.status}) na org ${target.name}.${dica} Para criar assim mesmo, repita com allow_duplicate_name=true, ou use outro nome.`,
          409,
        );
      }

      const conn = await getConnection(tenant, target.slug);
      if (!conn) throw new McpError("Organização não conectada.", 404);
      const pass = randomPass();
      const project: Project = await clientFor(conn).createProject({ name: pName, region, dbPass: pass });
      await putPassword(tenant, project.ref, encrypt(pass), "created");
      await rememberRefOrg(tenant, project.ref, target.slug).catch(() => {});
      return `Banco "${project.name}" criado (${project.ref}) na org ${target.name}. Senha do banco: ${pass}`;
    }
    case "create_org": {
      const usage = await orgUsage(tenant);
      if (usage.limit !== null && usage.used >= usage.limit) throw new McpError("Limite de organizações do plano atingido.", 403);
      const login = await getPatLogin(tenant, String(args.login_email));
      if (!login) throw new McpError("Login por Access Token não encontrado.", 404);
      const o = await createOrgWithToken(decrypt(login.token), String(args.name));
      const slug = o.slug ?? o.id;
      await putConnection({ tenantId: tenant, orgSlug: slug, orgName: o.name, plan: "free", accessToken: login.token, refreshToken: "", expiresAt: PAT_EXPIRES_AT, connectedAt: new Date().toISOString(), connectedBy: email, status: "ok", login: login.email, loginVerified: true, authKind: "pat", tokenVersion: login.createdAt });
      return `Organização "${o.name}" criada (${slug}).`;
    }
    default:
      throw new McpError(`Ação "${name}" não implementada.`, 404);
  }
}

function randomPass(len = 24): string {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += c[randomInt(c.length)];
  return out;
}
