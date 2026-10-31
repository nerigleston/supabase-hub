import { type NextRequest, NextResponse } from "next/server";

// Rotas públicas (sem sessão). O resto exige o cookie de sessão — a validação
// real fica em requireSession() (lib/session.ts); aqui é só a checagem otimista.
const PUBLIC = /^\/(login|cadastro|confirmar|esqueci-senha|redefinir-senha|nova-senha)(\/|$)/;

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // CSP por requisição com nonce: scripts inline só rodam com o nonce do momento,
  // então XSS por injeção de <script> não executa. 'strict-dynamic' deixa os
  // scripts confiáveis do Next carregarem os chunks.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  // só em dev o React usa eval() para debug; em produção a CSP fica estrita
  const devEval = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    // o fluxo OAuth "Uma organização" submete um form que redireciona ao Supabase
    "form-action 'self' https://api.supabase.com https://supabase.com",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // o Next lê este header para carimbar o nonce nos próprios scripts
  requestHeaders.set("content-security-policy", csp);

  const needsAuth = !PUBLIC.test(path);
  if (needsAuth && !request.cookies.has("sh_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  // roda em páginas; fora: assets estáticos, imagens, ícone e as rotas de API
  // (api/auth e api/supabase precisam seguir sem redirect; api/cron valida segredo)
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|brand/).*)"],
};
