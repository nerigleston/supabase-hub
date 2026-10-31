"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { pingNowAction } from "@/app/actions";
import { buttonClass } from "./app-ui";
import { toast } from "./toast";

const COOLDOWN_MS = 10 * 60 * 1000; // igual a MANUAL_PING_COOLDOWN_MS no servidor

/** Estado do ping manual com cooldown (usado no botão e no menu ⋯). */
export function usePingNow(org: string, projectRef: string, name: string, lastManualPingAt?: string) {
  const [manualAt, setManualAt] = useState(lastManualPingAt);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const waitMin = manualAt ? Math.max(0, Math.ceil((new Date(manualAt).getTime() + COOLDOWN_MS - now) / 60000)) : 0;

  const ping = () =>
    start(async () => {
      const r = await pingNowAction(org, projectRef, name);
      toast(r.ok, r.message);
      setNow(Date.now());
      if (r.data?.lastManualPingAt) setManualAt(r.data.lastManualPingAt);
      router.refresh();
    });

  return { ping, pending, waitMin, cooling: waitMin > 0 };
}

/**
 * "Pingar agora": select 1 fora do horário do cron, 1 a cada 10 min por banco.
 * compact: só ícone (tabela); senão, botão com texto (página do projeto).
 */
export function PingNowButton({
  org,
  projectRef,
  name,
  lastManualPingAt,
  compact = false,
}: {
  org: string;
  projectRef: string;
  name: string;
  lastManualPingAt?: string;
  compact?: boolean;
}) {
  const { ping, pending, waitMin, cooling } = usePingNow(org, projectRef, name, lastManualPingAt);
  const label = pending ? "Pingando…" : cooling ? `Pingar em ${waitMin} min` : "Pingar agora";
  const hint = cooling
    ? `Ping manual: 1 a cada 10 min por banco. Disponível em ${waitMin} min.`
    : `Pingar "${name}" agora (select 1): zera a contagem de 7 dias`;

  return (
    <button
      type="button"
      onClick={ping}
      disabled={pending || cooling}
      title={hint}
      aria-label={compact ? hint : undefined}
      className={compact ? buttonClass("secondary", "size-7 px-0 text-xs") : buttonClass("secondary", "text-xs")}
    >
      <RefreshCw className={pending ? "animate-spin" : ""} />
      {!compact && label}
    </button>
  );
}
