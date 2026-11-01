import "server-only";

// E-mails transacionais via Resend (API REST, sem SDK).
// Usado para convites de acesso a bancos (e, com o gatilho do Cognito, para
// confirmação de cadastro e troca de senha). Sem RESEND_API_KEY, nada é enviado
// e quem chamou recebe { ok: false } para mostrar o link manualmente.

export type EmailResult = { ok: true; id: string } | { ok: false; error: string };

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY);
const FROM = () => process.env.EMAIL_FROM || "BaseHub <convites@nerifilho.com.br>";

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<EmailResult> {
  if (!emailEnabled()) return { ok: false, error: "Envio de e-mail desligado (defina RESEND_API_KEY)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM(), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) return { ok: false, error: data.message ?? `Resend respondeu ${res.status}.` };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao enviar o e-mail." };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Moldura padrão dos e-mails (HTML simples, funciona nos clientes de e-mail). */
export function layout(opts: { title: string; intro: string; lines?: string[]; button?: { label: string; url: string }; footer: string }) {
  const lines = (opts.lines ?? []).map((l) => `<p style="margin:0 0 12px;color:#3f3f46;font-size:14px;line-height:1.6">${l}</p>`).join("");
  const button = opts.button
    ? `<p style="margin:24px 0"><a href="${esc(opts.button.url)}" style="background:#059669;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;display:inline-block">${esc(opts.button.label)}</a></p>
       <p style="margin:0 0 12px;color:#71717a;font-size:12px;line-height:1.5">Se o botão não abrir, copie este endereço no navegador:<br><span style="color:#059669;word-break:break-all">${esc(opts.button.url)}</span></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px">
<tr><td>
<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#18181b"><span style="color:#059669">base</span>hub</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#18181b">${esc(opts.title)}</h1>
<p style="margin:0 0 12px;color:#3f3f46;font-size:14px;line-height:1.6">${opts.intro}</p>
${lines}${button}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #f4f4f5;color:#a1a1aa;font-size:12px;line-height:1.5">${opts.footer}</p>
</td></tr></table></td></tr></table></body></html>`;
}

export { esc as escapeHtml };
