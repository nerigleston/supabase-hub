"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOrgAction } from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buttonClass, inputClass } from "./app-ui";
import { Spinner } from "./confirm-action";
import { toast } from "./toast";

/** Cria uma organização nova em um login conectado por Access Token. */
export function CreateOrgButton({ login }: { login: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const r = await createOrgAction(login, name);
      toast(r.ok, r.message);
      if (r.ok) {
        setOpen(false);
        setName("");
        router.refresh();
      }
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "px-2.5 py-1 text-xs")}>
        + Criar organização
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar organização</DialogTitle>
            <DialogDescription>Uma organização nova em {login}, já conectada ao Hub.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2) submit();
            }}
            className="flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Nome da organização</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex.: Cliente Acme"
                minLength={2}
                maxLength={64}
                className={inputClass}
              />
              <span className="text-xs text-zinc-500">No plano grátis do Supabase, cada organização tem seu próprio limite de 2 bancos ativos.</span>
            </label>
            <DialogFooter>
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary")}>Cancelar</button>
              <button type="submit" disabled={pending || name.trim().length < 2} className={buttonClass("primary")}>
                {pending && <Spinner />}
                {pending ? "Criando…" : "Criar organização"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
