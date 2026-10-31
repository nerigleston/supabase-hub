import type { NextRequest } from "next/server";
import { anthropic } from "@/lib/ai";
import { ASSISTANT_KNOWLEDGE, ASSISTANT_RULES } from "@/lib/assistant-knowledge";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";
import { OPEN_SECRET_TAIL, redactSecrets } from "@/lib/redact";
import { getSession } from "@/lib/session";

// Minichat de ajuda do painel. A chave da Anthropic fica só aqui no servidor
// (ANTHROPIC_API_KEY); o navegador só fala com esta rota.
// Modelo: Haiku (o mais barato). O system prompt (regras + guia do BaseHub) vai
// com cache_control, então a partir da 2ª mensagem o guia é lido do cache.

const MAX_HISTORY = 12; // últimas mensagens enviadas ao modelo
const MAX_CHARS = 2000; // por mensagem do usuário
const DAILY_LIMIT = 100; // mensagens por usuário por dia (teto de gasto)

/** Fora do tema ou tentativa de extrair o prompt: a resposta é trocada inteira. */
const LEAK_MARKERS = ["# BaseHub: guia completo do sistema", "Você é o assistente de ajuda do BaseHub"];

type ChatMessage = { role: "user" | "assistant"; content: string };


function clean(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .filter((m): m is ChatMessage => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    // guardrail de entrada: segredo colado nunca vai para a Anthropic
    .map((m) => ({ role: m.role, content: redactSecrets(m.content.slice(0, MAX_CHARS)).text.trim() }))
    .filter((m) => m.content)
    .slice(-MAX_HISTORY);
  // a API exige começar com user e terminar com user
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Faça login." }, { status: 401 });
  if (!env.aiEnabled) return Response.json({ error: "Assistente indisponível no momento." }, { status: 503 });

  const rl = await rateLimit(session.tenantId, "assistant", 30, 600); // 30 msgs / 10 min
  if (!rl.ok) return Response.json({ error: `Muitas mensagens seguidas. Tente de novo em ${Math.ceil(rl.retryAfterSec / 60)} min.` }, { status: 429 });
  // teto de gasto: 100 mensagens por dia por usuário
  const day = await rateLimit(session.tenantId, "assistant-day", DAILY_LIMIT, 86400);
  if (!day.ok)
    return Response.json(
      { error: `Você chegou ao limite de ${DAILY_LIMIT} mensagens por dia no assistente. Volta a liberar em ${Math.ceil(day.retryAfterSec / 3600)} h. A página Ajuda continua disponível.` },
      { status: 429 },
    );

  // teto diário GERAL (todos os usuários somados), protege o custo da chave
  const global = await rateLimit("GLOBAL", "assistant-day", env.aiGlobalDailyChat, 86400);
  if (!global.ok) return Response.json({ error: "O assistente atingiu o limite de uso de hoje. A página Ajuda continua disponível." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { messages?: unknown; page?: unknown } | null;
  const messages = clean(body?.messages);
  if (!messages) return Response.json({ error: "Mensagem inválida." }, { status: 400 });
  // página atual vai na última mensagem (fora do system, para não quebrar o cache)
  const page = typeof body?.page === "string" ? body.page.slice(0, 80) : "";
  if (page) messages[messages.length - 1] = { role: "user", content: `[O usuário está na página ${page}]\n${messages[messages.length - 1].content}` };

  let stream;
  try {
    stream = await anthropic().messages.create({
      model: env.aiModel,
      max_tokens: 800,
      stream: true,
      system: [
        { type: "text", text: ASSISTANT_RULES },
        // tudo até aqui (regras + guia) fica em cache
        { type: "text", text: ASSISTANT_KNOWLEDGE, cache_control: { type: "ephemeral" } },
      ],
      messages,
    });
  } catch (err) {
    console.error("assistant: falha ao chamar a Anthropic", err);
    return Response.json({ error: "O assistente não respondeu. Tente de novo." }, { status: 502 });
  }

  // Guardrail de saída: o texto do modelo passa pelo filtro de segredos antes de
  // chegar ao navegador. Um token que ainda está "aberto" no fim (ex.: "sk-ant-ab")
  // fica retido até fechar, para nunca sair meio segredo antes de ser mascarado.
  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      let raw = "";
      let sent = 0; // caracteres do texto JÁ filtrado enviados
      let blocked = false;
      const flush = (final: boolean) => {
        if (blocked) return;
        if (LEAK_MARKERS.some((m) => raw.includes(m))) {
          blocked = true;
          const msg = "Não posso mostrar isso. Posso explicar como usar qualquer parte do BaseHub: é só perguntar.";
          controller.enqueue(encoder.encode(sent ? `\n\n${msg}` : msg));
          return;
        }
        const safe = redactSecrets(raw).text;
        let upto = safe.length;
        if (!final) {
          const open = safe.slice(sent).match(OPEN_SECRET_TAIL);
          if (open?.index !== undefined) upto = sent + open.index;
        }
        if (upto > sent) {
          controller.enqueue(encoder.encode(safe.slice(sent, upto)));
          sent = upto;
        }
      };
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            raw += ev.delta.text;
            flush(false);
          }
          if (ev.type === "message_start") {
            const u = ev.message.usage;
            console.log("assistant uso", { in: u.input_tokens, cacheLido: u.cache_read_input_tokens, cacheCriado: u.cache_creation_input_tokens });
          }
        }
        flush(true);
      } catch (err) {
        console.error("assistant: stream interrompido", err);
        controller.enqueue(encoder.encode("\n\n(A resposta foi interrompida. Tente de novo.)"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
