import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/app-ui";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Página não encontrada" };

export default async function NotFound() {
  const session = await getSession();
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl dark:bg-emerald-600/20" />
      <header className="relative mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
        <Link href="/" aria-label="BaseHub, início">
          <Logo />
        </Link>
      </header>
      <main className="relative flex flex-1 items-center justify-center px-4 pb-24">
        <div className="max-w-md text-center">
          <p className="font-mono text-sm font-medium text-emerald-600 dark:text-emerald-400">404</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Página não encontrada</h1>
          <p className="mt-3 text-zinc-600 dark:text-zinc-400">
            O endereço pode ter mudado ou estar digitado errado. Se veio de um link, ele pode estar desatualizado.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={session ? "/painel" : "/"} className={buttonClass("primary", "h-10 px-5")}>
              {session ? "Ir para o painel" : "Voltar ao início"}
            </Link>
            {!session && (
              <Link href="/login" className={buttonClass("secondary", "h-10 px-5")}>Entrar</Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
