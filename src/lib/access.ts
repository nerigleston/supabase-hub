import "server-only";
import { cache } from "react";
import { type Connection, getConnection } from "./db";
import { can, type Role } from "./roles";
import { requireSession, type Session } from "./session";
import { getSharedWithMe, type SharedWithMe } from "./shares";

// "Quem pode fazer o quê neste banco". Toda tela e ação de um banco passa por aqui:
// - banco de uma conta conectada pelo próprio usuário: papel "owner";
// - banco compartilhado com ele: usa a CONEXÃO DO DONO, com o papel do convite.
// `tenant` é sempre o dono: logs, senha guardada, keep-alive e descrição ficam lá.

export type Access = {
  session: Session;
  tenant: string;
  conn: Connection;
  role: Role;
  shared: SharedWithMe | null;
};

export class AccessError extends Error {}

/** Resolve o acesso (ou null). Deduplicado na mesma requisição. */
export const resolveAccess = cache(async (orgSlug: string, ref: string): Promise<Access | null> => {
  const session = await requireSession();
  const own = await getConnection(session.tenantId, orgSlug);
  if (own) return { session, tenant: session.tenantId, conn: own, role: "owner", shared: null };
  const shared = await getSharedWithMe(session.tenantId, ref);
  if (!shared || shared.orgSlug !== orgSlug) return null;
  const conn = await getConnection(shared.ownerTenant, orgSlug);
  if (!conn) return null; // o dono desconectou a conta
  return { session, tenant: shared.ownerTenant, conn, role: shared.role, shared };
});

const NEED_MSG: Record<keyof typeof can, string> = {
  view: "Você não tem acesso a este banco.",
  write: "Seu acesso a este banco é só de leitura. Peça o papel de Editor a quem compartilhou.",
  secrets: "Seu papel neste banco não permite ver senha nem chaves. Peça o papel de Editor a quem compartilhou.",
  manage: "Só o dono ou um Admin do banco pode gerenciar quem tem acesso.",
  delete: "Só o dono pode excluir o banco.",
};

/** Para server actions: lança AccessError se faltar permissão. */
export async function requireAccess(orgSlug: string, ref: string, need: keyof typeof can = "view"): Promise<Access> {
  const access = await resolveAccess(orgSlug, ref);
  if (!access) throw new AccessError(NEED_MSG.view);
  if (!can[need](access.role)) throw new AccessError(NEED_MSG[need]);
  return access;
}

/** Quem fez a ação, no log do dono: o e-mail e, se for convidado, o papel. */
export function actor(a: Access) {
  return a.shared ? `${a.session.email} (convidado, ${a.role})` : a.session.email;
}
