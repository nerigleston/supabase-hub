"use client";

import { ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { saveMcpConfigAction } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import { buttonClass, Card } from "./app-ui";
import { Spinner } from "./confirm-action";
import { toast } from "./toast";

export type CatalogItem = { name: string; description: string; group: string; destructive?: boolean; /** age num banco (tem project_ref) */ perDb?: boolean };
export type ProjectLite = { ref: string; name: string; account: string };
type Config = { globalTools: string[]; perDb: Record<string, string[]> };

const GROUPS: { key: string; label: string; hint: string }[] = [
  { key: "leitura", label: "Leitura", hint: "Consultar sem alterar" },
  { key: "escrita", label: "SQL de escrita", hint: "Comandos que alteram dados" },
  { key: "ciclo", label: "Ciclo de vida", hint: "Reativar, pausar, manter ativo" },
  { key: "conta", label: "Conta (sensível)", hint: "Criar/excluir banco, criar organização" },
];

type DbMode = "padrao" | "personalizado" | "bloqueado";

const MODES: { value: DbMode; label: string }[] = [
  { value: "padrao", label: "Padrão" },
  { value: "personalizado", label: "Personalizado" },
  { value: "bloqueado", label: "Bloqueado" },
];

/** Seletor segmentado de 3 estados por banco. */
function ModeSwitch({ value, onChange, label }: { value: DbMode; onChange: (m: DbMode) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={`Acesso do MCP a ${label}`} className="inline-flex shrink-0 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
      {MODES.map((m) => {
        const on = value === m.value;
        const tone =
          m.value === "bloqueado"
            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
            : m.value === "personalizado"
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100";
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${on ? tone : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function ToolToggles({ catalog, value, onToggle }: { catalog: CatalogItem[]; value: Set<string>; onToggle: (name: string, on: boolean) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g) => {
        const items = catalog.filter((t) => t.group === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800">
            <div className="flex items-baseline gap-2">
              <h4 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{g.label}</h4>
              <span className="text-xs text-zinc-400">{g.hint}</span>
            </div>
            {items.map((t) => (
              <label key={t.name} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <span className="min-w-0 text-sm">
                  <code className="text-xs text-zinc-500">{t.name}</code>
                  {t.destructive && <span className="ml-1.5 rounded bg-rose-100 px-1.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">irreversível</span>}
                  <span className="block text-xs text-zinc-500">{t.description}</span>
                </span>
                <Switch checked={value.has(t.name)} onCheckedChange={(v) => onToggle(t.name, v)} aria-label={t.name} />
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function McpSettings({ catalog, config, projects }: { catalog: CatalogItem[]; config: Config; projects: ProjectLite[] }) {
  const [globalTools, setGlobal] = useState<Set<string>>(new Set(config.globalTools));
  const [overrides, setOverrides] = useState<Record<string, Set<string>>>(
    Object.fromEntries(Object.entries(config.perDb).map(([ref, names]) => [ref, new Set(names)])),
  );
  // bancos em "personalizado" (explícito, para não virar "bloqueado" ao desligar a última ação)
  const [customRefs, setCustomRefs] = useState<Set<string>>(
    new Set(Object.entries(config.perDb).filter(([, names]) => names.length > 0).map(([ref]) => ref)),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();

  const dbCatalog = catalog.filter((t) => t.perDb);
  const globalDbCount = dbCatalog.filter((t) => globalTools.has(t.name)).length;

  // bancos agrupados por conta, filtrados pela busca
  const q = query.trim().toLowerCase();
  const visible = projects.filter((p) => !q || p.name.toLowerCase().includes(q) || p.ref.includes(q) || p.account.toLowerCase().includes(q));
  const groups = [...new Set(visible.map((p) => p.account))].sort().map((account) => ({
    account,
    items: visible.filter((p) => p.account === account).sort((a, b) => a.name.localeCompare(b.name)),
  }));
  const modeOf = (ref: string): DbMode =>
    customRefs.has(ref) ? "personalizado" : !(ref in overrides) ? "padrao" : overrides[ref].size === 0 ? "bloqueado" : "personalizado";
  const counts = {
    custom: projects.filter((p) => modeOf(p.ref) === "personalizado").length,
    blocked: projects.filter((p) => modeOf(p.ref) === "bloqueado").length,
  };

  const setMode = (ref: string, mode: DbMode) => {
    setCustomRefs((prev) => {
      const next = new Set(prev);
      if (mode === "personalizado") next.add(ref);
      else next.delete(ref);
      return next;
    });
    setOverrides((prev) => {
      const next = { ...prev };
      if (mode === "padrao") delete next[ref];
      else if (mode === "bloqueado") next[ref] = new Set();
      // personalizado começa igual ao padrão (só as ações de banco), para ajustar a partir dele
      else next[ref] = prev[ref]?.size ? prev[ref] : new Set(dbCatalog.filter((t) => globalTools.has(t.name)).map((t) => t.name));
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      if (mode === "personalizado") next.add(ref);
      else next.delete(ref);
      return next;
    });
  };

  const toggleExpanded = (ref: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });

  const toggleGlobal = (name: string, on: boolean) =>
    setGlobal((prev) => {
      const next = new Set(prev);
      if (on) next.add(name);
      else next.delete(name);
      return next;
    });

  const toggleOverride = (ref: string, name: string, on: boolean) =>
    setOverrides((prev) => {
      const next = { ...prev };
      const set = new Set(next[ref]);
      if (on) set.add(name);
      else set.delete(name);
      next[ref] = set;
      return next;
    });

  const save = () =>
    start(async () => {
      const cfg: Config = {
        globalTools: [...globalTools],
        perDb: Object.fromEntries(Object.entries(overrides).map(([ref, set]) => [ref, [...set]])),
      };
      const r = await saveMcpConfigAction(cfg);
      toast(r.ok, r.message);
    });

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5 p-5">
        <div>
          <h2 className="font-semibold">Ações padrão (todos os bancos)</h2>
          <p className="mt-1 text-sm text-zinc-500">O que o MCP pode fazer em qualquer banco, a menos que você defina um ajuste específico abaixo.</p>
        </div>
        <ToolToggles catalog={catalog} value={globalTools} onToggle={toggleGlobal} />
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Acesso por banco</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Cada banco segue o padrão, a menos que você personalize ou bloqueie. O que for definido aqui vale só para aquele banco.
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            {projects.length} bancos · {counts.custom} personalizados · {counts.blocked} bloqueados
          </p>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar banco, ref ou conta"
          aria-label="Buscar banco"
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 sm:max-w-xs dark:bg-input/30"
        />

        {groups.length === 0 ? (
          <p className="text-sm text-zinc-500">{projects.length ? "Nenhum banco encontrado." : "Nenhum banco conectado ainda."}</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.account} className="flex flex-col">
                <h3 className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">{g.account}</h3>
                <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {g.items.map((p) => {
                    const mode = modeOf(p.ref);
                    const set = overrides[p.ref];
                    const isOpen = mode === "personalizado" && expanded.has(p.ref);
                    const resumo =
                      mode === "padrao"
                        ? `Padrão · ${globalDbCount} de ${dbCatalog.length} ações`
                        : mode === "bloqueado"
                          ? "Sem acesso pelo MCP"
                          : `${set.size} de ${dbCatalog.length} ações`;
                    return (
                      <li key={p.ref} className="flex flex-col">
                        <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => mode === "personalizado" && toggleExpanded(p.ref)}
                            disabled={mode !== "personalizado"}
                            aria-expanded={mode === "personalizado" ? isOpen : undefined}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                          >
                            {mode === "personalizado" && (
                              <ChevronRight aria-hidden className={`size-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{p.name}</span>
                              <span className="block truncate font-mono text-xs text-zinc-500">
                                {p.ref} · <span className={mode === "bloqueado" ? "text-rose-600 dark:text-rose-400" : ""}>{resumo}</span>
                              </span>
                            </span>
                          </button>
                          <ModeSwitch value={mode} onChange={(m) => setMode(p.ref, m)} label={p.name} />
                        </div>
                        {isOpen && (
                          <div className="border-t border-zinc-100 bg-zinc-50/60 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                            <ToolToggles catalog={dbCatalog} value={set} onToggle={(name, on) => toggleOverride(p.ref, name, on)} />
                            {set.size === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Tudo desligado: ao salvar, este banco fica bloqueado.</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <button onClick={save} disabled={pending} className={buttonClass("primary", "shadow-lg")}>
          {pending && <Spinner />}
          {pending ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>
    </div>
  );
}
