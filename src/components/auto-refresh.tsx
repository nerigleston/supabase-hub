"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Spinner } from "./confirm-action";
import { buttonClass } from "./app-ui";

/**
 * Mostra quando os dados foram lidos e atualiza sozinho enquanto
 * houver projeto em transição (reativando, pausando…). Heurística 1.
 */
export function AutoRefresh({ busy, loadedAt }: { busy: boolean; loadedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState(loadedAt);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => start(() => router.refresh()), 10_000);
    return () => clearInterval(id);
  }, [busy, router]);

  const secs = Math.max(0, Math.round((now - loadedAt) / 1000));
  const ago = secs < 5 ? "agora" : secs < 60 ? `há ${secs}s` : `há ${Math.floor(secs / 60)} min`;

  return (
    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span>
        Atualizado {ago}
        {busy && " · atualizando a cada 10s enquanto há projetos em transição"}
      </span>
      <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className={buttonClass("secondary", "px-2.5 py-1 text-xs")}>
        {pending && <Spinner />} Atualizar
      </button>
    </div>
  );
}
