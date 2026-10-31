"use client";

import { MessageCircleQuestion, RotateCcw, SendHorizontal, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { redactSecrets } from "@/lib/redact";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "basehub-assistant";
const SUGGESTIONS = [
  "Como conecto outra conta Supabase?",
  "Como evito que o banco grátis pause?",
  "Como crio um banco novo?",
  "Como conecto o MCP no Claude?",
];

// Markdown mínimo (negrito, `código`, listas), montado como elementos React (sem innerHTML).
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-zinc-200/70 px-1 py-0.5 font-mono text-[0.8em] break-all dark:bg-zinc-700/70">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`${list.ordered ? "list-decimal" : "list-disc"} flex flex-col gap-1 pl-5`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ol || ul) {
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((ol ?? ul)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.replace(/^#{1,6}\s+/, "");
    blocks.push(
      <p key={blocks.length} className={heading !== line ? "font-semibold" : undefined}>
        {inline(heading)}
      </p>,
    );
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export function AssistantChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false); // anima a saída antes de desmontar
  const [pop, setPop] = useState(false); // pulinho do botão ao apertar
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // conversa sobrevive à navegação e ao recarregar (só nesta aba):
  // carrega ao abrir pela 1ª vez e só grava depois disso
  const loadedRef = useRef(false);
  const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const close = () => {
    if (!open || closing) return;
    if (reduceMotion()) {
      setOpen(false);
      return;
    }
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 150);
  };
  const toggle = () => {
    setPop(true);
    if (open) {
      close();
      return;
    }
    if (!loadedRef.current) {
      loadedRef.current = true;
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) setMsgs(JSON.parse(saved) as Msg[]);
      } catch {}
    }
    setOpen(true);
  };
  // o Esc usa sempre a versão atual do close
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const send = async (text: string) => {
    // guardrail: segredo colado é mascarado aqui, antes de sair do navegador
    const { text: content, redacted } = redactSecrets(text.trim());
    if (!content || busy) return;
    setError(redacted ? "Removi um dado sensível (senha, token ou chave) da sua mensagem antes de enviar. Se ele é real, troque-o." : "");
    setInput("");
    const history: Msg[] = [...msgs, { role: "user", content }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, page: pathname }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "O assistente não respondeu. Tente de novo.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMsgs([...history, { role: "assistant", content: acc }]);
      }
      if (!acc.trim()) throw new Error("O assistente não respondeu. Tente de novo.");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMsgs(history); // tira a bolha vazia; a pergunta fica para reenviar
      setError((err as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMsgs([]);
    setError("");
    setBusy(false);
    inputRef.current?.focus();
  };

  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content;

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Assistente do BaseHub"
          data-closing={closing || undefined}
          className="assistant-panel fixed inset-x-3 bottom-20 z-40 flex h-[min(34rem,calc(100dvh-7rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:w-96 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Ajuda do BaseHub</h2>
              <p className="text-xs text-zinc-500">Pergunte como fazer qualquer coisa no painel.</p>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Nova conversa"
                  title="Nova conversa"
                  className="inline-grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <RotateCcw className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Fechar ajuda"
                className="inline-grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite">
            {msgs.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-zinc-600 dark:text-zinc-300">Oi! Eu explico o BaseHub passo a passo. Experimente:</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-emerald-950/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-emerald-600 px-3 py-2 whitespace-pre-wrap text-white">
                    {m.content}
                  </div>
                ) : (
                  <div key={i} className="max-w-[92%] self-start rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 leading-relaxed text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                    {m.content ? (
                      <Rich text={m.content} />
                    ) : (
                      <span className="inline-flex gap-1 py-1" aria-label="Escrevendo">
                        <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                        <span className="size-1.5 animate-bounce rounded-full bg-zinc-400" />
                      </span>
                    )}
                  </div>
                ),
              )
            )}
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
                {error}{" "}
                {lastUser && (
                  <button
                    type="button"
                    className="font-medium underline"
                    onClick={() => {
                      setMsgs((prev) => prev.slice(0, -1));
                      send(lastUser);
                    }}
                  >
                    Tentar de novo
                  </button>
                )}
              </div>
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Escreva sua dúvida"
              aria-label="Sua dúvida"
              className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-700"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Enviar"
              className="inline-grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              <SendHorizontal className="size-4" />
            </button>
          </form>
          <p className="px-3 pb-2 text-[11px] text-zinc-400">Respostas por IA podem errar. Não cole senhas ou tokens aqui.</p>
        </section>
      )}

      <button
        type="button"
        onClick={toggle}
        onAnimationEnd={() => setPop(false)}
        data-pop={pop || undefined}
        aria-label={open && !closing ? "Fechar ajuda" : "Abrir ajuda do BaseHub"}
        aria-expanded={open && !closing}
        className="assistant-fab fixed right-5 bottom-5 z-40 inline-grid size-12 place-items-center rounded-full bg-emerald-600 text-white shadow-lg transition-[background-color,box-shadow,transform] hover:scale-105 hover:bg-emerald-700 hover:shadow-xl active:scale-90 focus-visible:ring-4 focus-visible:ring-emerald-500/40 focus-visible:outline-none"
      >
        {/* os dois ícones ficam sobrepostos e trocam girando */}
        <span className="relative grid size-6 place-items-center" aria-hidden>
          <MessageCircleQuestion
            className={`absolute size-6 transition-all duration-200 motion-reduce:transition-none ${open && !closing ? "scale-50 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"}`}
          />
          <X
            className={`absolute size-5 transition-all duration-200 motion-reduce:transition-none ${open && !closing ? "scale-100 rotate-0 opacity-100" : "scale-50 rotate-90 opacity-0"}`}
          />
        </span>
      </button>
    </>
  );
}
