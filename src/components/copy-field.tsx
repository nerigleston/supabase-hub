"use client";

import { useState } from "react";
import { buttonClass } from "./app-ui";

/** Campo somente leitura com copiar e, para segredos, mostrar/ocultar. */
export function CopyField({ label, value, secret = false, hint }: { label: string; value: string; secret?: boolean; hint?: string }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs whitespace-nowrap dark:border-zinc-800 dark:bg-zinc-950">
          {shown ? value : "•".repeat(Math.min(32, value.length))}
        </code>
        {secret && (
          <button type="button" onClick={() => setShown((s) => !s)} className={buttonClass("secondary", "px-2.5 text-xs")}>
            {shown ? "Ocultar" : "Mostrar"}
          </button>
        )}
        <button type="button" onClick={copy} className={buttonClass("secondary", "w-20 px-2.5 text-xs")} aria-live="polite">
          {copied ? "Copiado ✓" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
