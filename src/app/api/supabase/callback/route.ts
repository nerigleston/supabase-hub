import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { addLog, getConnection, putConnection } from "@/lib/db";
import { orgBudget } from "@/lib/plans";
import { requireSession, takeOAuthState } from "@/lib/session";
import {
  exchangeCode,
  getOrganizationWithToken,
  inferLogin,
  listMembersWithToken,
  listOrganizationsWithToken,
  sealTokens,
} from "@/lib/supabase-api";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  const params = request.nextUrl.searchParams;
  const saved = await takeOAuthState("sh_oauth_supabase");

  if (params.get("error")) redirect("/contas?erro=negado");
  if (!saved || saved.state !== params.get("state") || !params.get("code")) redirect("/contas?erro=expirado");

  const added: string[] = [];
  const renewed: string[] = [];
  let login: string | undefined;
  const budget = await orgBudget(session.tenantId);
  try {
    const tokens = await exchangeCode(params.get("code")!, saved.verifier);
    const orgs = await listOrganizationsWithToken(tokens.access_token);
    const sealed = sealTokens(tokens);

    for (const org of orgs) {
      const slug = org.slug ?? org.id;
      const [detail, members, existing] = await Promise.all([
        getOrganizationWithToken(tokens.access_token, slug).catch(() => null),
        listMembersWithToken(tokens.access_token, slug).catch(() => []),
        getConnection(session.tenantId, slug),
      ]);
      // organização nova só entra se o plano tiver vaga
      if (!existing && !budget.take()) {
        budget.block(org.name);
        continue;
      }
      const identity = inferLogin(members, saved.hint);
      login ??= identity.login;
      await putConnection({
        tenantId: session.tenantId,
        orgSlug: slug,
        orgName: org.name,
        plan: detail?.plan,
        label: existing?.label,
        ...sealed,
        connectedAt: existing?.connectedAt ?? new Date().toISOString(),
        connectedBy: session.email,
        status: "ok",
        login: identity.login ?? existing?.login,
        loginVerified: identity.login ? identity.loginVerified : existing?.loginVerified,
      });
      await addLog(session.tenantId, {
        user: session.email,
        action: existing ? "reconectar_conta" : "conectar_conta",
        target: identity.login ? `${org.name} (${identity.login})` : org.name,
        ok: true,
      });
      (existing ? renewed : added).push(org.name);
    }
  } catch (err) {
    console.error("Supabase OAuth callback", err);
    await addLog(session.tenantId, { user: session.email, action: "conectar_conta", target: "?", ok: false, detail: String(err) });
    redirect("/contas?erro=falha");
  }

  if (!added.length && !renewed.length && !budget.blocked.length) redirect("/contas?erro=sem_org");

  const q = new URLSearchParams();
  if (budget.blocked.length) q.set("limite", budget.blocked.join(", "));
  if (added.length) q.set("conectada", added.join(", "));
  if (renewed.length) q.set("renovada", renewed.join(", "));
  // Queria outro e-mail mas só voltaram orgs já conectadas: o supabase.com ainda está no login antigo.
  if (saved.hint && !added.length) q.set("mesmo_login", login ?? "");
  // Informou um e-mail, mas o Supabase autorizou com outro login.
  else if (saved.hint && login && login !== saved.hint) q.set("outro_login", login);
  redirect(`/contas?${q}`);
}
