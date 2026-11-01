"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actor, requireAccess } from "@/lib/access";
import { addLog } from "@/lib/db";
import { escapeHtml as esc, layout, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { getPlan, hasPro, plansEnabled } from "@/lib/plans";
import { rateLimit, tooMany } from "@/lib/ratelimit";
import { type GuestRole, isGuestRole, MCP_CEILING, mcpDefault, ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { getSession, requireSession } from "@/lib/session";
import { acceptInvite, changeRole, createInvite, dropInvite, getInvite, getMember, INVITE_DAYS, removeMember, setMemberMcp } from "@/lib/shares";
import { clientFor } from "@/lib/supabase-api";
import { findUser } from "@/lib/users";
import type { ActionResult } from "./actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (err: unknown): ActionResult<never> => ({ ok: false, message: err instanceof Error ? err.message : "Erro inesperado." });

function inviteMail(o: { inviter: string; project: string; role: GuestRole; link: string }) {
  const subject = `${o.inviter} compartilhou o banco "${o.project}" com você`;
  const html = layout({
    title: "Você recebeu acesso a um banco",
    intro: `<strong>${esc(o.inviter)}</strong> compartilhou o banco <strong>${esc(o.project)}</strong> com você no BaseHub, com o papel <strong>${ROLE_LABEL[o.role]}</strong>.`,
    lines: [esc(ROLE_HINT[o.role]), `Entre no BaseHub com este e-mail para aceitar. O convite vale por ${INVITE_DAYS} dias.`],
    button: { label: "Ver convite", url: o.link },
    footer: "Se você não esperava este convite, pode ignorar este e-mail: nada acontece sem você aceitar.",
  });
  const text = `${o.inviter} compartilhou o banco "${o.project}" com você no BaseHub (papel: ${ROLE_LABEL[o.role]}).\n\n${ROLE_HINT[o.role]}\n\nVer convite: ${o.link}\n\nO convite vale por ${INVITE_DAYS} dias. Se não esperava, ignore este e-mail.`;
  return { subject, html, text };
}

type InviteResult = ActionResult<{ emailSent: boolean; link?: string }>;

async function sendInvite(params: { orgSlug: string; ref: string; email: string; role: GuestRole; resend?: boolean }): Promise<InviteResult> {
  const a = await requireAccess(params.orgSlug, params.ref, "manage");
  // compartilhar é recurso pago (do plano de quem é DONO do banco)
  if (plansEnabled() && !hasPro(await getPlan(a.tenant)))
    return { ok: false, message: "Compartilhar bancos é do plano Pro ou Business. Faça o upgrade em Plano." };
  const rl = await rateLimit(a.session.tenantId, "invite", 20, 3600);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const email = params.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Informe um e-mail válido." };
  if (email === a.session.email.toLowerCase()) return { ok: false, message: "Você já tem acesso a este banco." };
  const ownerEmail = a.shared ? a.shared.ownerEmail : a.session.email;
  if (email === ownerEmail.toLowerCase()) return { ok: false, message: "Esse e-mail é do dono do banco." };

  // só convida quem já tem conta no BaseHub
  if (!(await findUser(email)))
    return { ok: false, message: `${email} ainda não tem conta no BaseHub. Peça para a pessoa criar a conta e depois convide de novo.` };

  const project = await clientFor(a.conn).getProject(params.ref);
  const { token } = await createInvite({
    ownerTenant: a.tenant,
    ownerEmail,
    ref: params.ref,
    orgSlug: params.orgSlug,
    projectName: project.name,
    email,
    role: params.role,
    invitedBy: a.session.email,
  });
  const link = `${env.appUrl}/convite/${token}`;
  const mail = inviteMail({ inviter: a.session.email, project: project.name, role: params.role, link });
  const sent = await sendEmail({ to: email, ...mail, replyTo: a.session.email });
  await addLog(a.tenant, {
    user: actor(a),
    action: params.resend ? "reenviar_convite" : "convidar",
    target: `${email} em ${project.name} (${params.ref})`,
    ok: true,
    detail: `papel ${ROLE_LABEL[params.role]}${sent.ok ? "" : `; e-mail não enviado: ${sent.error}`}`,
  });
  revalidatePath(`/p/${params.orgSlug}/${params.ref}/acesso`);
  return sent.ok
    ? { ok: true, message: `Convite enviado para ${email}.`, data: { emailSent: true } }
    : { ok: true, message: `Convite criado, mas o e-mail não saiu (${sent.error}). Copie o link e envie você mesmo.`, data: { emailSent: false, link } };
}

export async function inviteAction(orgSlug: string, ref: string, email: string, role: string): Promise<InviteResult> {
  if (!isGuestRole(role)) return { ok: false, message: "Escolha um papel." };
  try {
    return await sendInvite({ orgSlug, ref, email, role });
  } catch (err) {
    return fail(err);
  }
}

export async function resendInviteAction(orgSlug: string, ref: string, email: string): Promise<InviteResult> {
  try {
    const a = await requireAccess(orgSlug, ref, "manage");
    const m = await getMember(a.tenant, ref, email);
    if (!m || m.status !== "pending") return { ok: false, message: "Este convite não está mais pendente." };
    return await sendInvite({ orgSlug, ref, email, role: m.role, resend: true });
  } catch (err) {
    return fail(err);
  }
}

export async function changeRoleAction(orgSlug: string, ref: string, email: string, role: string): Promise<ActionResult> {
  if (!isGuestRole(role)) return { ok: false, message: "Papel inválido." };
  try {
    const a = await requireAccess(orgSlug, ref, "manage");
    if (email === a.session.email.toLowerCase()) return { ok: false, message: "Você não pode mudar o seu próprio papel." };
    const m = await getMember(a.tenant, ref, email);
    if (!m) return { ok: false, message: "Esta pessoa não tem mais acesso." };
    await changeRole(a.tenant, ref, email, role);
    await addLog(a.tenant, { user: actor(a), action: "mudar_papel", target: `${email} em ${m.projectName} (${ref})`, ok: true, detail: `${ROLE_LABEL[m.role]} → ${ROLE_LABEL[role]}` });
    revalidatePath(`/p/${orgSlug}/${ref}/acesso`);
    return { ok: true, message: `${email} agora é ${ROLE_LABEL[role]}.` };
  } catch (err) {
    return fail(err);
  }
}

/** Revoga um acesso ativo ou cancela um convite pendente. */
export async function revokeAction(orgSlug: string, ref: string, email: string): Promise<ActionResult> {
  try {
    const a = await requireAccess(orgSlug, ref, "manage");
    if (email === a.session.email.toLowerCase()) return { ok: false, message: "Para tirar o seu próprio acesso, use Sair deste banco." };
    const m = await getMember(a.tenant, ref, email);
    if (!m) return { ok: true, message: "Esta pessoa já não tinha acesso." };
    await removeMember(a.tenant, ref, email);
    await addLog(a.tenant, {
      user: actor(a),
      action: m.status === "pending" ? "cancelar_convite" : "revogar_acesso",
      target: `${email} em ${m.projectName} (${ref})`,
      ok: true,
    });
    if (m.status === "active") {
      // aviso cortês; se falhar, não muda nada
      await sendEmail({
        to: email,
        subject: `Seu acesso ao banco "${m.projectName}" foi removido`,
        html: layout({
          title: "Acesso removido",
          intro: `Seu acesso ao banco <strong>${esc(m.projectName)}</strong> no BaseHub foi removido por ${esc(a.session.email)}.`,
          footer: "Se acha que foi engano, fale com quem compartilhou o banco com você.",
        }),
        text: `Seu acesso ao banco "${m.projectName}" no BaseHub foi removido por ${a.session.email}.`,
      }).catch(() => null);
    }
    revalidatePath(`/p/${orgSlug}/${ref}/acesso`);
    return { ok: true, message: m.status === "pending" ? `Convite para ${email} cancelado.` : `Acesso de ${email} revogado.` };
  } catch (err) {
    return fail(err);
  }
}

/** O convidado tira o próprio acesso. */
export async function leaveAction(orgSlug: string, ref: string): Promise<ActionResult> {
  try {
    const a = await requireAccess(orgSlug, ref, "view");
    if (!a.shared) return { ok: false, message: "Este banco é seu; não dá para sair dele." };
    await removeMember(a.tenant, ref, a.session.email.toLowerCase());
    await addLog(a.tenant, { user: actor(a), action: "sair_do_banco", target: `${a.shared.projectName} (${ref})`, ok: true });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/", "layout");
  redirect("/painel?saiu=1");
}

export async function acceptInviteAction(token: string): Promise<ActionResult> {
  const session = await requireSession();
  const inv = await getInvite(token);
  if (!inv) return { ok: false, message: "Este convite expirou ou já foi usado. Peça um novo a quem compartilhou." };
  if (inv.email !== session.email.toLowerCase())
    return { ok: false, message: `Este convite é para ${inv.email}. Entre com essa conta para aceitar.` };
  await acceptInvite(inv, session.tenantId);
  await addLog(inv.ownerTenant, { user: session.email, action: "aceitar_convite", target: `${inv.projectName} (${inv.ref})`, ok: true, detail: `papel ${ROLE_LABEL[inv.role]}` });
  revalidatePath("/", "layout");
  redirect(`/p/${inv.orgSlug}/${inv.ref}`);
}

export async function declineInviteAction(token: string): Promise<ActionResult> {
  const inv = await getInvite(token);
  if (!inv) return { ok: true, message: "Este convite já não vale mais." };
  const session = await getSession();
  await dropInvite({ ownerTenant: inv.ownerTenant, ref: inv.ref, email: inv.email, hash: inv.hash });
  await addLog(inv.ownerTenant, { user: session?.email ?? inv.email, action: "recusar_convite", target: `${inv.projectName} (${inv.ref})`, ok: true });
  return { ok: true, message: "Convite recusado. Quem convidou vai ver isso no histórico." };
}

/** Dono/Admin escolhe as ações do MCP que uma pessoa pode usar neste banco (dentro do teto do papel). */
export async function setMemberMcpAction(orgSlug: string, ref: string, email: string, tools: string[]): Promise<ActionResult> {
  try {
    const a = await requireAccess(orgSlug, ref, "manage");
    const m = await getMember(a.tenant, ref, email);
    if (!m) return { ok: false, message: "Esta pessoa não tem mais acesso." };
    const ceiling = new Set(MCP_CEILING[m.role]);
    const clean = [...new Set(tools)].filter((t) => ceiling.has(t));
    // igual ao padrão do papel: guarda "sem escolha" para acompanhar mudanças de papel
    const isDefault = clean.length === mcpDefault(m.role).length && mcpDefault(m.role).every((t) => clean.includes(t));
    await setMemberMcp(a.tenant, ref, email, isDefault ? undefined : clean);
    await addLog(a.tenant, { user: actor(a), action: "mcp_convidado", target: `${email} em ${m.projectName} (${ref})`, ok: true, detail: clean.join(", ") || "nenhuma ação" });
    revalidatePath(`/p/${orgSlug}/${ref}/acesso`);
    return { ok: true, message: `Ações do MCP de ${email} atualizadas.` };
  } catch (err) {
    return fail(err);
  }
}
