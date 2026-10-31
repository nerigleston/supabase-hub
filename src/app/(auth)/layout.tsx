import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getSession } from "@/lib/session";

const POINTS = [
  { title: "Todas as contas num lugar", body: "Conecte quantas contas Supabase quiser via OAuth e veja todos os projetos juntos." },
  { title: "Banco caiu? Um clique", body: "Projetos pausados aparecem em destaque e voltam ao ar com um clique." },
  { title: "Limite grátis sob controle", body: "Veja quantos bancos grátis cada e-mail ainda pode ligar e crie onde houver espaço." },
  { title: "Tabelas, SQL e conexões", body: "Explore dados, rode SQL e copie connection strings sem trocar de conta." },
];

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/painel");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-white/10 bg-zinc-950 text-zinc-100 lg:block">
        <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 size-[520px] rounded-full bg-emerald-600/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-32 -bottom-40 size-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative mx-auto flex h-full max-w-xl flex-col justify-between px-10 py-10 xl:px-14">
        <Link href="/" aria-label="BaseHub" className="relative">
          <Logo onDark />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Gestão central de todos os seus bancos Supabase.</h2>
          <ul className="mt-8 flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span aria-hidden className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-600/20 text-xs text-emerald-400">✓</span>
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-zinc-400">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-zinc-500">Tokens e senhas criptografados (AES-256-GCM). Acesso via OAuth oficial do Supabase.</p>
        </div>
      </aside>
      <main className="flex items-center justify-center bg-white px-4 py-10 dark:bg-zinc-900">
        <div className="w-full max-w-sm">
          <Link href="/" aria-label="BaseHub" className="mb-8 block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
