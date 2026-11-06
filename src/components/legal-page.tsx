import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { env } from "@/lib/env";

/** Moldura das páginas públicas de texto legal (termos, reembolso). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const { company, cnpj } = env.contact;
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6">
        <Link href="/" aria-label="BaseHub, início">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 md:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">Última atualização: {updated}</p>
        <div className="mt-8 space-y-6 leading-relaxed text-zinc-700 dark:text-zinc-300 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-white [&_li]:mt-2 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:font-medium [&_a]:text-emerald-600 [&_a:hover]:underline dark:[&_a]:text-emerald-400">
          {children}
        </div>
        <nav className="mt-16 flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
          <Link href="/termos" className="hover:text-zinc-900 dark:hover:text-white">Termos de Uso</Link>
          <Link href="/reembolso" className="hover:text-zinc-900 dark:hover:text-white">Cancelamento e reembolso</Link>
          <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">Início</Link>
          {(company || cnpj) && (
            <span className="w-full text-xs">
              {company}
              {cnpj ? ` · CNPJ ${cnpj}` : ""}
            </span>
          )}
        </nav>
      </main>
    </div>
  );
}

/** Formas de contato para pedidos (cancelamento, reembolso, dúvidas). */
export function ContactList() {
  const { email, whatsapp } = env.contact;
  if (!email && !whatsapp) return <p>Pelo suporte indicado no rodapé do site.</p>;
  return (
    <ul>
      {email && (
        <li>
          E-mail: <a href={`mailto:${email}`}>{email}</a>
        </li>
      )}
      {whatsapp && (
        <li>
          WhatsApp: <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">+{whatsapp}</a>
        </li>
      )}
    </ul>
  );
}
