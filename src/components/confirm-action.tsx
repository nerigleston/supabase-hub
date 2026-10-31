"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { buttonClass } from "./app-ui";
import { toast } from "./toast";

type Props = {
  label: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  /** Sem `confirm`, executa direto. Com, abre diálogo (heurísticas 3 e 5). */
  confirm?: {
    title: string;
    body: ReactNode;
    confirmLabel: string;
    danger?: boolean;
    /** Exige digitar este texto para liberar o botão (ações irreversíveis). */
    typeToConfirm?: string;
  };
  action: () => Promise<ActionResult<unknown>>;
  onDone?: (result: ActionResult<unknown>) => void;
  pendingLabel?: string;
};

export type ConfirmSpec = NonNullable<Props["confirm"]>;

export function ConfirmAction({ label, variant = "secondary", size = "sm", confirm, action, onDone, pendingLabel = "Aguarde…" }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const runDirect = () =>
    start(async () => {
      const result = await action();
      toast(result.ok, result.message);
      onDone?.(result);
      if (result.ok) router.refresh();
    });

  const sizeClass = size === "sm" ? "text-xs" : "";

  return (
    <>
      <button type="button" disabled={pending} onClick={() => (confirm ? setOpen(true) : runDirect())} className={buttonClass(variant, sizeClass)}>
        {pending && <Spinner />}
        {pending ? pendingLabel : label}
      </button>
      {confirm && (
        <ConfirmDialog open={open} onOpenChange={setOpen} confirm={confirm} action={action} onDone={onDone} pendingLabel={pendingLabel} />
      )}
    </>
  );
}

/** Diálogo de confirmação controlado: usado pelo ConfirmAction e por menus (⋯). */
export function ConfirmDialog({
  open,
  onOpenChange,
  confirm,
  action,
  onDone,
  pendingLabel = "Aguarde…",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirm: ConfirmSpec;
  action: () => Promise<ActionResult<unknown>>;
  onDone?: (result: ActionResult<unknown>) => void;
  pendingLabel?: string;
}) {
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const blocked = confirm.typeToConfirm ? typed.trim() !== confirm.typeToConfirm : false;

  const run = () =>
    start(async () => {
      const result = await action();
      toast(result.ok, result.message);
      onOpenChange(false);
      setTyped("");
      onDone?.(result);
      if (result.ok) router.refresh();
    });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        // não fecha no meio da execução
        if (!pending) onOpenChange(o);
        if (!o) setTyped("");
      }}
    >
      <AlertDialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocked) run();
          }}
          className="flex flex-col gap-4"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>{confirm.body}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm.typeToConfirm && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span>
                Para confirmar, digite <strong className="font-mono">{confirm.typeToConfirm}</strong>
              </span>
              <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} className="font-mono" />
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Cancelar
            </AlertDialogCancel>
            <button type="submit" disabled={pending || blocked} className={buttonClass(confirm.danger ? "danger" : "primary")}>
              {pending && <Spinner />}
              {pending ? pendingLabel : confirm.confirmLabel}
            </button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Spinner() {
  return <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}
