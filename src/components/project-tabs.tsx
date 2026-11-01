"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabs({ base, canManage = false }: { base: string; canManage?: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Conexão" },
    { href: `${base}/tabelas`, label: "Tabelas" },
    { href: `${base}/sql`, label: "SQL" },
    // quem tem acesso e convites: só dono e Admin
    ...(canManage ? [{ href: `${base}/acesso`, label: "Acesso" }] : []),
  ];
  return (
    <nav aria-label="Seções do projeto" className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              active
                ? "border-emerald-600 font-medium text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
