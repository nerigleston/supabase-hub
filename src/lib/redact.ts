// Detecta e mascara segredos em texto livre (minichat de ajuda).
// Roda no navegador (antes de enviar: o segredo nem sai da máquina) e no servidor
// (defesa extra na entrada e filtro na saída do modelo).

export const REDACTED = "[segredo removido]";

const PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic
  /\bsk-(?:proj-|live_|test_)?[A-Za-z0-9_-]{20,}/g, // OpenAI, Stripe e afins
  /\b(?:sbp|sb_secret|sbs)_[A-Za-z0-9_-]{16,}/g, // Supabase (access token, secret key)
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT (service_role, anon...)
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, // chave de acesso AWS
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, // chave privada
];

// senha dentro de URL de conexão: postgres://user:SENHA@host -> postgres://user:[segredo removido]@host
const URL_PASSWORD = /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s:/@]+:)([^\s@]+)(@)/gi;
// "senha: xxx", "password=xxx", "token: xxx"
const LABELED = /\b(senha|password|passwd|pwd|token|secret|api[_ -]?key|chave)(\s*[:=]\s*)("?)([^\s"']{6,})\3/gi;

export function redactSecrets(text: string): { text: string; redacted: boolean } {
  // marcadores como [YOUR-PASSWORD] não são senha
  let out = text.replace(URL_PASSWORD, (m, pre: string, pwd: string, at: string) => (pwd.startsWith("[") ? m : `${pre}${REDACTED}${at}`));
  for (const re of PATTERNS) out = out.replace(re, REDACTED);
  out = out.replace(LABELED, (m, label: string, sep: string, q: string, value: string) =>
    value === REDACTED || value.startsWith("[") ? m : `${label}${sep}${q}${REDACTED}${q}`,
  );
  return { text: out, redacted: out !== text };
}

/**
 * Início de algo que pode virar segredo e ainda não terminou (sem espaço depois).
 * No streaming da saída, o servidor segura o texto a partir daqui até o token
 * fechar, para nunca mandar meio segredo ao navegador antes de mascarar.
 */
export const OPEN_SECRET_TAIL = /(?:sk-|sbp_|sb_secret_|sbs_|eyJ|AKIA|ASIA|gh[pousr]_|xox[abprs]-|-----BEGIN|[a-z]+s?:\/\/\S*:)\S*$/i;
