"use client";

import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Explica "Manter ativo" no próprio lugar onde a dúvida aparece (heurística 10). */
export function KeepAliveInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="O que é Manter ativo?"
          className="inline-grid size-4 place-items-center rounded-full border border-current text-[10px] leading-none font-semibold normal-case opacity-60 hover:opacity-100"
        >
          i
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm normal-case" align="start">
        <p className="font-semibold">O que é “Manter ativo”?</p>
        <p className="mt-2 text-muted-foreground">
          No plano grátis, o Supabase <strong className="text-foreground">pausa o banco depois de 7 dias sem nenhum SQL</strong>. Com
          “Manter ativo” ligado, o Hub roda um <code>select 1</code> por você e o banco não pausa.
        </p>
        <ul className="mt-3 flex flex-col gap-1.5 text-muted-foreground">
          <li>• <strong className="text-foreground">Ao ligar:</strong> faz o primeiro ping na hora.</li>
          <li>• <strong className="text-foreground">Todo dia às 06:00</strong> (Brasília): pinga todos os bancos ligados, em fila.</li>
          <li>• <strong className="text-foreground">Pingar agora:</strong> ping manual, 1 a cada 10 min por banco.</li>
          <li>• Banco <strong className="text-foreground">pausado</strong> não recebe ping: reative primeiro.</li>
          <li>• Banco mantido ativo conta como 1 dos 2 bancos grátis ligados do e-mail.</li>
        </ul>
        <Link href="/ajuda#keepalive" className="mt-3 inline-block font-medium text-primary hover:underline">
          Saiba mais na Ajuda →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
