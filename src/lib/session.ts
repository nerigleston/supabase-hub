import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { rememberUser } from "./users";

export const SESSION_COOKIE = "sh_session";
const SESSION_HOURS = 12;
const CHALLENGE_COOKIE = "sh_challenge";

/** tenantId isola os dados de cada cliente do SaaS (hoje = sub do Cognito). */
export type Session = { sub: string; email: string; tenantId: string };

function secret() {
  return new TextEncoder().encode(env.sessionSecret);
}

const cookieBase = () => ({
  httpOnly: true,
  secure: env.appUrl.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
});

export async function createSession(identity: { sub: string; email: string }) {
  const token = await new SignJWT({ email: identity.email, tid: identity.sub })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(identity.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieBase(), maxAge: SESSION_HOURS * 3600 });
  // índice e-mail -> conta (para convites só a quem já tem conta); falha não bloqueia o login
  await rememberUser({ email: identity.email, sub: identity.sub, tenantId: identity.sub }).catch(() => {});
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { sub: payload.sub!, email: String(payload.email ?? ""), tenantId: String(payload.tid ?? payload.sub) };
  } catch {
    return null;
  }
}

/** Data Access Layer: toda leitura/ação protegida passa por aqui. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

// Desafio NEW_PASSWORD_REQUIRED do Cognito (usuário criado por convite):
// guarda e-mail + session do Cognito num cookie assinado de 5 minutos.
export async function setChallenge(email: string, cognitoSession: string) {
  const token = await new SignJWT({ email, cs: cognitoSession })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secret());
  (await cookies()).set(CHALLENGE_COOKIE, token, { ...cookieBase(), maxAge: 300 });
}

export async function getChallenge(): Promise<{ email: string; session: string } | null> {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { email: String(payload.email), session: String(payload.cs) };
  } catch {
    return null;
  }
}

export async function clearChallenge() {
  (await cookies()).delete(CHALLENGE_COOKIE);
}

// Cookie curto para state + PKCE do OAuth do Supabase.
export type OAuthState = { state: string; verifier: string; hint?: string };

export async function setOAuthState(name: string, value: OAuthState) {
  (await cookies()).set(name, JSON.stringify(value), { ...cookieBase(), maxAge: 600 });
}

export async function takeOAuthState(name: string): Promise<OAuthState | null> {
  const store = await cookies();
  const raw = store.get(name)?.value;
  store.delete(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
