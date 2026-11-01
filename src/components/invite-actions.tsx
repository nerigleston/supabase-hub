"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { acceptInviteAction, declineInviteAction } from "@/app/share-actions";
import { buttonClass } from "./app-ui";
import { Spinner } from "./confirm-action";

export function InviteActions({ token, canAccept }: { token: string; canAccept: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [which, setWhich] = useState<"accept" | "decline" | null>(null);

  if (result?.ok && which === "decline")
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{result.message}</p>
        <Link href="/" className={buttonClass("secondary", "justify-center")}>Ir para o início</Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      {result && !result.ok && <p className="text-sm text-rose-600 dark:text-rose-400">{result.message}</p>}
      <div className="flex gap-2">
        {canAccept && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setWhich("accept");
              // em caso de sucesso a action redireciona para o banco
              start(async () => setResult(await acceptInviteAction(token)));
            }}
            className={buttonClass("primary", "flex-1 justify-center")}
          >
            {pending && which === "accept" && <Spinner />} Aceitar e abrir o banco
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setWhich("decline");
            start(async () => setResult(await declineInviteAction(token)));
          }}
          className={buttonClass("secondary", canAccept ? "" : "flex-1 justify-center")}
        >
          {pending && which === "decline" && <Spinner />} Recusar
        </button>
      </div>
    </div>
  );
}
