"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setKeepAliveAction } from "@/app/actions";
import type { KeepAliveView } from "@/lib/hub";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "./confirm-action";
import { KeepAliveInfo } from "./keepalive-info";
import { toast } from "./toast";

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function ago(iso?: string) {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/**
 * Interruptor "Manter ativo": ao ligar, já faz o primeiro ping; depois o cron
 * diário mantém o banco com atividade (heurísticas 1, 3 e 9).
 */
export function KeepAliveToggle({
  org,
  projectRef,
  name,
  value,
  disabled,
  showLabel = false,
}: {
  org: string;
  projectRef: string;
  name: string;
  value?: KeepAliveView;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  const [on, setOn] = useState(Boolean(value?.enabled));
  const [last, setLast] = useState({ at: value?.lastPingAt, ok: value?.lastOk, error: value?.lastError });
  const [pending, start] = useTransition();
  const router = useRouter();

  const toggle = () =>
    start(async () => {
      const next = !on;
      setOn(next); // otimista; volta se der erro
      const r = await setKeepAliveAction(org, projectRef, name, next);
      toast(r.ok, r.message);
      if (!r.data) {
        setOn(!next);
        return;
      }
      if (r.data.lastPingAt || r.data.error) setLast({ at: r.data.lastPingAt ?? new Date().toISOString(), ok: r.data.ok, error: r.data.error });
      router.refresh();
    });

  const status = !on
    ? "Desligado"
    : last.at
      ? last.ok
        ? `Último ping ${ago(last.at)}`
        : `Falhou ${ago(last.at)}`
      : "Aguardando primeiro ping";

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={on}
        onCheckedChange={toggle}
        aria-label={`Manter "${name}" ativo`}
        disabled={disabled || pending}
        title={disabled ? "Reative o projeto para ligar o keep-alive" : on ? "Desligar keep-alive" : "Ligar keep-alive: ping diário para não pausar"}
      />
      <span className={`text-xs whitespace-nowrap ${on && last.at && !last.ok ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`} title={on && !last.ok ? last.error : undefined}>
        {pending ? (
          <span className="inline-flex items-center gap-1">
            <Spinner /> {on ? "Pingando…" : "Salvando…"}
          </span>
        ) : (
          <>
            {showLabel && (
              <strong className="mr-1 inline-flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-200">
                Manter ativo <KeepAliveInfo />:
              </strong>
            )}
            {status}
          </>
        )}
      </span>
    </div>
  );
}
