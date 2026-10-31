"use client"; // error boundaries precisam ser Client Components

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass } from "@/components/app-ui";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Em produção o Next troca a mensagem por um código (digest); ele ajuda a achar o erro nos logs.
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest?: string }).digest) : null;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm font-medium text-rose-600 dark:text-rose-400">Erro</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Algo deu errado aqui</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Não foi possível carregar esta página. Tente de novo; se continuar, pode ser instabilidade do Supabase ou do servidor.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className={buttonClass("primary", "h-10 px-5")}>Tentar de novo</button>
          <Link href="/" className={buttonClass("secondary", "h-10 px-5")}>Voltar ao início</Link>
        </div>
        {digest && <p className="mt-6 font-mono text-xs text-zinc-400">Código: {digest}</p>}
      </div>
    </div>
  );
}
