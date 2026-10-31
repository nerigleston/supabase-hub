"use client";

import { Copy, Database, ExternalLink, MoreHorizontal, Pause, Play, RefreshCw, SquareTerminal, Table2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { pauseProjectAction, restoreProjectAction } from "@/app/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectRow } from "@/lib/hub";
import { buttonClass } from "./app-ui";
import { ConfirmDialog, type ConfirmSpec } from "./confirm-action";
import { usePingNow } from "./ping-now-button";
import { toast } from "./toast";

/** Menu ⋯ da linha do projeto: todas as ações num lugar conhecido (heurística 4). */
export function ProjectActionsMenu({ project: p }: { project: ProjectRow }) {
  const [dialog, setDialog] = useState<"restore" | "pause" | null>(null);
  const { ping, pending: pinging, waitMin, cooling } = usePingNow(p.accountSlug, p.ref, p.name, p.keepAlive?.lastManualPingAt);
  const base = `/p/${p.accountSlug}/${p.ref}`;
  const online = p.status === "ACTIVE_HEALTHY" || p.status === "ACTIVE_UNHEALTHY";
  const paused = p.status === "INACTIVE" || p.status === "RESTORE_FAILED";

  const restore: ConfirmSpec = {
    title: `Reativar "${p.name}"?`,
    body: (
      <>
        O projeto volta ao ar em 2 a 5 minutos, com os dados intactos. No plano grátis ele passa a contar como 1 dos 2 bancos ligados do
        e-mail <strong>{p.login ?? p.account}</strong>.
      </>
    ),
    confirmLabel: "Reativar agora",
  };
  const pause: ConfirmSpec = {
    title: `Pausar "${p.name}"?`,
    body: (
      <>
        O banco e as APIs ficam <strong>fora do ar</strong> para as aplicações até você reativar. Os dados são mantidos.
        {p.keepAlive?.enabled && " O keep-alive deste banco vai falhar enquanto ele estiver pausado."}
      </>
    ),
    confirmLabel: "Pausar projeto",
    danger: true,
    typeToConfirm: p.name,
  };

  const copyRef = async () => {
    await navigator.clipboard.writeText(p.ref);
    toast(true, `Ref de "${p.name}" copiada.`);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Ações de "${p.name}"`} className={buttonClass("ghost", "size-7 px-0 text-xs")}>
            <MoreHorizontal />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{p.name}</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={base}>
              <Database /> Abrir projeto
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild disabled={!online}>
            <Link href={`${base}/tabelas`}>
              <Table2 /> Tabelas
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild disabled={!online}>
            <Link href={`${base}/sql`}>
              <SquareTerminal /> Editor SQL
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!online || pinging || cooling} onSelect={ping}>
            <RefreshCw className={pinging ? "animate-spin" : ""} />
            {pinging ? "Pingando…" : cooling ? `Pingar agora (em ${waitMin} min)` : "Pingar agora"}
          </DropdownMenuItem>
          {paused && (
            <DropdownMenuItem onSelect={() => setDialog("restore")}>
              <Play /> Reativar
            </DropdownMenuItem>
          )}
          {online && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("pause")}>
              <Pause /> Pausar
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={copyRef}>
            <Copy /> Copiar ref
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`https://supabase.com/dashboard/project/${p.ref}`} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir no Supabase
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "restore"}
        onOpenChange={(o) => !o && setDialog(null)}
        confirm={restore}
        action={() => restoreProjectAction(p.accountSlug, p.ref, p.name)}
        pendingLabel="Reativando…"
      />
      <ConfirmDialog
        open={dialog === "pause"}
        onOpenChange={(o) => !o && setDialog(null)}
        confirm={pause}
        action={() => pauseProjectAction(p.accountSlug, p.ref, p.name)}
        pendingLabel="Pausando…"
      />
    </>
  );
}
