"use client";

import { useEffect, useState } from "react";

// Feedback imediato de toda ação (heurística 1) e erro com saída clara (heurística 9).
type Toast = { id: number; ok: boolean; message: string };

export function toast(ok: boolean, message: string) {
  if (!message) return;
  window.dispatchEvent(new CustomEvent("sh-toast", { detail: { ok, message } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { ok, message } = (e as CustomEvent<{ ok: boolean; message: string }>).detail;
      const id = ++seq;
      setItems((prev) => [...prev, { id, ok, message }]);
      // erro fica mais tempo na tela que sucesso
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), ok ? 5000 : 12000);
    };
    window.addEventListener("sh-toast", onToast);
    return () => window.removeEventListener("sh-toast", onToast);
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.ok ? "status" : "alert"}
          className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
          }`}
        >
          <span aria-hidden className="mt-0.5 font-bold">{t.ok ? "✓" : "!"}</span>
          <p className="flex-1">{t.message}</p>
          <button
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className="opacity-60 hover:opacity-100"
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
