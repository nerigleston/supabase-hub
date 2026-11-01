"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { type DescriptionDraft, generateDescriptionAction, saveDescriptionAction } from "@/app/actions";
import { buttonClass, Card } from "./app-ui";
import { Spinner } from "./confirm-action";
import { toast } from "./toast";

export type DescriptionView = { text: string; source: "ai" | "manual"; updatedAt: string; updatedBy: string } | null;
export type StaleInfo = { added: string[]; removed: string[]; changed: string[] } | null;

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const list = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(", ")} e mais ${xs.length - 4}` : xs.join(", "));
const textareaClass =
  "min-h-28 w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-700";

export function ProjectDescription({
  org,
  projectRef,
  initial,
  stale,
  aiEnabled,
  online,
  canEdit = true,
}: {
  org: string;
  projectRef: string;
  initial: DescriptionView;
  stale: StaleInfo;
  aiEnabled: boolean;
  online: boolean;
  canEdit?: boolean;
}) {
  const [desc, setDesc] = useState(initial);
  const [isStale, setIsStale] = useState(Boolean(stale));
  const [mode, setMode] = useState<"view" | "edit" | "ai">("view");
  const [text, setText] = useState(initial?.text ?? "");
  const [samples, setSamples] = useState(false);
  const [draft, setDraft] = useState<(DescriptionDraft & { depth: "normal" | "ampla"; remaining: number }) | null>(null);
  const [pending, start] = useTransition();
  const [generating, startGen] = useTransition();

  const generate = (depth: "normal" | "ampla") =>
    startGen(async () => {
      const r = await generateDescriptionAction(org, projectRef, { includeSamples: samples, depth });
      if (!r.ok || !r.data) return toast(false, r.message);
      setDraft({ ...r.data, depth });
      setText(r.data.text);
    });

  const save = (value: string, source: "ai" | "manual") =>
    start(async () => {
      const r = await saveDescriptionAction(org, projectRef, value, source);
      toast(r.ok, r.message);
      if (!r.ok) return;
      setDesc(value.trim() ? { text: value.trim(), source, updatedAt: new Date().toISOString(), updatedBy: "você" } : null);
      setIsStale(false);
      setDraft(null);
      setMode("view");
    });

  const cancel = () => {
    setMode("view");
    setDraft(null);
    setText(desc?.text ?? "");
  };

  return (
    <Card className="mb-4 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Sobre este banco</h2>
          <p className="text-xs text-zinc-500">
            {desc
              ? `${
                  desc.updatedBy.startsWith("IA")
                    ? "Gerada com IA, ainda não revisada. Confira e ajuste em Editar"
                    : `${desc.source === "ai" ? "Gerada com IA e revisada" : "Escrita à mão"} por ${desc.updatedBy}`
                } em ${fmt.format(new Date(desc.updatedAt))}. O MCP usa este texto para saber qual banco é qual.`
              : "Uma descrição curta ajuda você e o MCP a saberem do que este banco trata."}
          </p>
        </div>
        {mode === "view" && canEdit && (
          <div className="flex flex-wrap gap-2">
            {/* IA só quando há motivo (sem descrição ou esquema mudou): controle de custo */}
            {aiEnabled && online && !desc && (
              <button type="button" onClick={() => setMode("ai")} className={buttonClass("primary", "text-xs")}>
                <Sparkles aria-hidden className="size-3.5" />
                Gerar com IA
              </button>
            )}
            <button type="button" onClick={() => setMode("edit")} className={buttonClass("secondary", "text-xs")}>
              {desc ? "Editar" : "Escrever"}
            </button>
          </div>
        )}
      </div>

      {mode === "view" && desc && <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-700 dark:text-zinc-200">{desc.text}</p>}

      {mode === "view" && canEdit && isStale && stale && desc && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            O esquema mudou desde a última revisão
            {stale.added.length > 0 && <>: novas: {list(stale.added)}</>}
            {stale.changed.length > 0 && <>; com colunas alteradas: {list(stale.changed)}</>}
            {stale.removed.length > 0 && <>; removidas: {list(stale.removed)}</>}.
          </span>
          <span className="flex gap-2">
            {aiEnabled && online && (
              <button type="button" onClick={() => setMode("ai")} className={buttonClass("secondary", "text-xs")}>
                Revisar com IA
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => save(desc.text, desc.source)} className={buttonClass("ghost", "text-xs")}>
              {pending && <Spinner />} Continua certa
            </button>
          </span>
        </div>
      )}

      {mode === "edit" && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            autoFocus
            placeholder="Ex.: Banco do app de delivery da Acme: pedidos, entregadores e cardápio dos restaurantes."
            aria-label="Descrição do banco"
            className={textareaClass}
          />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => save(text, "manual")} className={buttonClass("primary", "text-xs")}>
              {pending && <Spinner />} Salvar
            </button>
            <button type="button" onClick={cancel} className={buttonClass("secondary", "text-xs")}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "ai" && !draft && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            A IA lê a estrutura do banco (tabelas, colunas e relações) e escreve um rascunho para você revisar. Nada é salvo sem sua confirmação.
            Em bancos grandes, só as tabelas mais importantes vão com detalhes. Para controlar o custo, são até 3 rascunhos por versão do
            esquema, e a IA volta a ficar disponível quando uma tabela ou coluna mudar.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} className="mt-1 accent-emerald-600" />
            <span>
              Incluir 2 linhas de exemplo por tabela
              <span className="block text-xs text-zinc-500">
                Melhora o resultado, mas envia dados reais para a Anthropic. Colunas como senha, token, e-mail, CPF e telefone vão ocultas.
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={generating} onClick={() => generate("normal")} className={buttonClass("primary", "text-xs")}>
              {generating ? <Spinner /> : <Sparkles aria-hidden className="size-3.5" />}
              {generating ? "Lendo o esquema…" : "Gerar rascunho"}
            </button>
            <button type="button" onClick={cancel} className={buttonClass("secondary", "text-xs")}>Cancelar</button>
          </div>
        </div>
      )}

      {mode === "ai" && draft && (
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-300 bg-emerald-50/40 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Rascunho da IA: confira e ajuste antes de salvar</span>
            <span className="text-xs text-zinc-500">
              Usou {draft.usedTables} de {draft.totalTables} tabelas · {draft.remaining} rascunho(s) restante(s) para esta versão
            </span>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label="Rascunho da descrição" className={textareaClass} />
          {draft.doubts.length > 0 && (
            <div className="text-sm">
              <p className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">A IA ficou em dúvida sobre:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-300">
                {draft.doubts.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-zinc-500">Se souber a resposta, corrija o texto acima.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || !text.trim()} onClick={() => save(text, "ai")} className={buttonClass("primary", "text-xs")}>
              {pending && <Spinner />} Salvar descrição
            </button>
            {draft.remaining > 0 && draft.depth === "normal" && draft.totalTables > draft.usedTables && (
              <button type="button" disabled={generating} onClick={() => generate("ampla")} className={buttonClass("secondary", "text-xs")}>
                {generating && <Spinner />} Usar mais tabelas
              </button>
            )}
            {draft.remaining > 0 && (
              <button type="button" disabled={generating} onClick={() => generate(draft.depth)} className={buttonClass("ghost", "text-xs")}>
                Gerar de novo
              </button>
            )}
            <button type="button" onClick={cancel} className={buttonClass("ghost", "text-xs")}>Descartar</button>
          </div>
        </div>
      )}
    </Card>
  );
}
