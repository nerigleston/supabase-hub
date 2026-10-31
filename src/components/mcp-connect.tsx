"use client";

import { type ReactNode, useState } from "react";
import { buttonClass, Card } from "./app-ui";
import { CopyField } from "./copy-field";

/** Bloco de código com botão de copiar (config de vários clientes). */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      {lang && <span className="absolute top-2 left-3 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">{lang}</span>}
      <button
        type="button"
        onClick={copy}
        className={buttonClass("secondary", "absolute top-2 right-2 h-7 px-2.5 text-xs")}
        aria-live="polite"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
      <pre className={`overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 px-3 ${lang ? "pt-7" : "pt-3"} pb-3 text-xs dark:border-zinc-800 dark:bg-zinc-950`}>
        <code className="font-mono text-zinc-800 dark:text-zinc-200">{code}</code>
      </pre>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {i + 1}
          </span>
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ol>
  );
}

const CLIENTS = [
  { key: "claude", label: "Claude" },
  { key: "chatgpt", label: "ChatGPT" },
  { key: "cursor", label: "Cursor" },
  { key: "code", label: "Claude Code" },
  { key: "codex", label: "Codex" },
] as const;

type ClientKey = (typeof CLIENTS)[number]["key"];

export function McpConnect({ mcpUrl }: { mcpUrl: string }) {
  const [tab, setTab] = useState<ClientKey>("claude");

  const content: Record<ClientKey, ReactNode> = {
    claude: (
      <Steps
        items={[
          <>No app ou no site, abra <strong>Configurações</strong>, <strong>Conectores</strong>.</>,
          <>Clique em <strong>Adicionar conector personalizado</strong>.</>,
          <>Cole a URL do servidor acima e salve.</>,
          <>O Claude abre o login do BaseHub e pede sua autorização. Pronto.</>,
        ]}
      />
    ),
    chatgpt: (
      <div className="flex flex-col gap-3">
        <Steps
          items={[
            <>Em <strong>Configurações</strong>, <strong>Conectores</strong>, <strong>Avançado</strong>, ative o <strong>Modo desenvolvedor</strong>.</>,
            <>Volte em <strong>Conectores</strong> e clique em <strong>Adicionar conector personalizado</strong>.</>,
            <>Cole a URL, marque que confia na fonte e crie.</>,
            <>Faça o login do BaseHub quando pedir.</>,
            <>Em cada conversa, abra o menu <strong>+</strong>, <strong>Modo desenvolvedor</strong> e marque o BaseHub.</>,
          ]}
        />
        <p className="text-xs text-zinc-500">
          Precisa de um plano pago (Plus, Pro, Business, Enterprise ou Edu). Em workspaces Business e Enterprise, um admin pode precisar liberar
          conectores personalizados.
        </p>
      </div>
    ),
    cursor: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Abra <strong>Configurações</strong>, <strong>MCP e ferramentas</strong>, <strong>New MCP server</strong> e cole o bloco abaixo (ou edite o
          seu <code className="text-xs">mcp.json</code>):
        </p>
        <CodeBlock
          lang="mcp.json"
          code={`{
  "mcpServers": {
    "basehub": {
      "url": "${mcpUrl}"
    }
  }
}`}
        />
        <p className="text-xs text-zinc-500">Na primeira vez, o Cursor abre o login do BaseHub para autorizar.</p>
      </div>
    ),
    code: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Rode no terminal:</p>
        <CodeBlock lang="bash" code={`claude mcp add --transport http basehub ${mcpUrl}`} />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Depois, dentro do Claude Code, use <code className="text-xs">/mcp</code> para fazer o login do BaseHub.
        </p>
      </div>
    ),
    codex: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Adicione em <code className="text-xs">~/.codex/config.toml</code>:
        </p>
        <CodeBlock
          lang="config.toml"
          code={`[mcp_servers.basehub]
url = "${mcpUrl}"`}
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Depois, rode o login do OAuth:</p>
        <CodeBlock lang="bash" code={`codex mcp login basehub`} />
      </div>
    ),
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-semibold">Conectar no seu cliente</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Funciona no Claude, ChatGPT, Cursor, Claude Code e Codex. O login é sempre pelo próprio BaseHub (OAuth), então você não cola nenhuma
          senha ou token no assistente.
        </p>
      </div>

      <CopyField label="URL do servidor MCP" value={mcpUrl} />

      <div className="flex flex-wrap gap-1.5 border-b border-zinc-100 pb-2 dark:border-zinc-800" role="tablist">
        {CLIENTS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={tab === c.key}
            onClick={() => setTab(c.key)}
            className={
              tab === c.key
                ? buttonClass("primary", "h-8 px-3 text-xs")
                : buttonClass("ghost", "h-8 px-3 text-xs")
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div>{content[tab]}</div>
    </Card>
  );
}
