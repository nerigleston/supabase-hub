import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { pkceChallenge, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { requireSession, setOAuthState } from "@/lib/session";
import { authorizeUrl } from "@/lib/supabase-api";

export async function GET(request: NextRequest) {
  await requireSession();
  if (!env.supabase.configured) redirect("/contas?erro=oauth_nao_configurado");

  // ?login=email: e-mail que o usuário diz que vai usar no Supabase (ajuda a identificar o login).
  const hint = request.nextUrl.searchParams.get("login")?.trim().toLowerCase().slice(0, 254) || undefined;
  const state = randomToken(16);
  const verifier = randomToken(48);
  await setOAuthState("sh_oauth_supabase", { state, verifier, hint });
  redirect(authorizeUrl({ state, challenge: pkceChallenge(verifier) }));
}
