"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/painel", label: "Visão geral", icon: "▦" },
  { href: "/novo", label: "Novo banco", icon: "+" },
  { href: "/contas", label: "Contas", icon: "◎" },
  { href: "/atividade", label: "Atividade", icon: "≡" },
  { href: "/ajuda", label: "Ajuda", icon: "?" },
];

const PLAN_LINK = { href: "/assinar", label: "Plano", icon: "★" };

function NavLinks({ pathname, onNavigate, showPlan }: { pathname: string; onNavigate?: () => void; showPlan: boolean }) {
  const isActive = (href: string) => (href === "/painel" ? pathname === "/painel" || pathname.startsWith("/p/") : pathname.startsWith(href));
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {(showPlan ? [...LINKS.slice(0, -1), PLAN_LINK, LINKS[LINKS.length - 1]] : LINKS).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onClick={onNavigate}
          aria-current={isActive(l.href) ? "page" : undefined}
          className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm ${
            isActive(l.href)
              ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          <span aria-hidden className="w-4 text-center font-mono">{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

function Footer({ email }: { email: string }) {
  return (
    <div className="border-t border-zinc-200 p-4 text-xs dark:border-zinc-800">
      <div className="mb-3">
        <ThemeToggle compact />
      </div>
      <p className="truncate text-zinc-500" title={email}>{email}</p>
      <form action="/api/auth/logout" method="post" className="mt-2">
        <button className="text-zinc-600 hover:underline dark:text-zinc-300">Sair</button>
      </form>
    </div>
  );
}

export function Nav({ email, showPlan = false }: { email: string; showPlan?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // trava o scroll do corpo enquanto a gaveta está aberta (os links a fecham no clique)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Desktop: barra lateral fixa */}
      <aside className="hidden shrink-0 flex-col border-zinc-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-56 md:border-r dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/painel" aria-label="BaseHub, visão geral" className="px-4 py-4">
          <Logo />
        </Link>
        <div className="px-2">
          <NavLinks pathname={pathname} showPlan={showPlan} />
        </div>
        <div className="mt-auto">
          <Footer email={email} />
        </div>
      </aside>

      {/* Mobile: barra superior + botão da gaveta */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-900/90">
        <Link href="/painel" aria-label="BaseHub, visão geral">
          <Logo />
        </Link>
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-grid size-9 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile: gaveta */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between px-4 py-4">
              <Logo />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
                className="inline-grid size-9 place-items-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} showPlan={showPlan} />
            </div>
            <Footer email={email} />
          </div>
        </div>
      )}
    </>
  );
}
