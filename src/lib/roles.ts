// Papéis de acesso a um banco compartilhado (vale no servidor e na tela).
// owner = quem conectou a conta Supabase; os outros vêm de convite.

export type Role = "owner" | "admin" | "editor" | "leitura";
export type GuestRole = Exclude<Role, "owner">;

export const ROLE_RANK: Record<Role, number> = { leitura: 1, editor: 2, admin: 3, owner: 4 };

export const ROLE_LABEL: Record<Role, string> = { owner: "Dono", admin: "Admin", editor: "Editor", leitura: "Leitura" };

export const ROLE_HINT: Record<GuestRole, string> = {
  leitura: "Vê o banco e as tabelas e roda SQL só de leitura. Não vê senha nem chaves secretas.",
  editor: "Tudo da Leitura, mais SQL de escrita, manter ativo, pausar e reativar, e ver senha e chaves.",
  admin: "Tudo do Editor, mais convidar, mudar papéis e revogar acessos.",
};

export const GUEST_ROLES: GuestRole[] = ["leitura", "editor", "admin"];

export const isGuestRole = (r: unknown): r is GuestRole => r === "leitura" || r === "editor" || r === "admin";

/** O que cada papel pode fazer. */
export const can = {
  view: (r: Role) => ROLE_RANK[r] >= ROLE_RANK.leitura,
  write: (r: Role) => ROLE_RANK[r] >= ROLE_RANK.editor, // SQL de escrita, keep-alive, pausar/reativar, descrição
  secrets: (r: Role) => ROLE_RANK[r] >= ROLE_RANK.editor, // senha do banco e chaves de API
  manage: (r: Role) => ROLE_RANK[r] >= ROLE_RANK.admin, // convidar, mudar papel, revogar, redefinir senha
  delete: (r: Role) => r === "owner",
};

// ---------- MCP em banco compartilhado ----------
// Teto por papel: o que cada papel PODE ter liberado no MCP (excluir/criar banco e
// ações de conta nunca valem para convidados).
const MCP_READ = ["get_project", "list_tables", "table_rows", "run_sql"];
const MCP_WRITE = [...MCP_READ, "sql_write", "connection_strings", "ping_project", "restore_project", "pause_project"];

export const MCP_CEILING: Record<GuestRole, string[]> = { leitura: MCP_READ, editor: MCP_WRITE, admin: MCP_WRITE };

/** Padrão quando o dono/Admin não escolheu: o teto do papel. */
export const mcpDefault = (role: GuestRole) => MCP_CEILING[role];

/** Ações liberadas para o convidado neste banco (sempre dentro do teto do papel). */
export function mcpForMember(role: GuestRole, chosen?: string[]) {
  const ceiling = new Set(MCP_CEILING[role]);
  return (chosen ?? mcpDefault(role)).filter((t) => ceiling.has(t));
}

export const MCP_TOOL_LABEL: Record<string, string> = {
  get_project: "Ver detalhes do banco",
  list_tables: "Listar tabelas",
  table_rows: "Ler linhas das tabelas",
  run_sql: "SQL de leitura",
  sql_write: "SQL de escrita",
  connection_strings: "Ver connection strings",
  ping_project: "Pingar (manter ativo)",
  restore_project: "Reativar",
  pause_project: "Pausar",
};
