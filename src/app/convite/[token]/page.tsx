import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/app-ui";
import { InviteActions } from "@/components/invite-actions";
import { Logo } from "@/components/logo";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { getSession } from "@/lib/session";
import { getInvite } from "@/lib/shares";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-5">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

// Página pública do link do convite. O token é de uso único e só vale para o e-mail convidado.
export default async function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const [inv, session] = await Promise.all([getInvite(token), getSession()]);

  if (!inv)
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Convite inválido ou expirado</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Este link já foi usado, foi cancelado ou passou de 7 dias. Peça um convite novo a quem compartilhou o banco com você.
        </p>
        <Link href={session ? "/painel" : "/login"} className={buttonClass("secondary", "mt-4 w-full justify-center")}>
          {session ? "Ir para o painel" : "Entrar"}
        </Link>
      </Shell>
    );

  const back = `/convite/${token}`;
  const wrongUser = session && session.email.toLowerCase() !== inv.email;

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Você foi convidado para um banco</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        <strong>{inv.invitedBy}</strong> compartilhou o banco <strong>{inv.projectName}</strong> com <strong>{inv.email}</strong>, com o papel{" "}
        <strong>{ROLE_LABEL[inv.role]}</strong>.
      </p>
      <p className="mt-2 text-xs text-zinc-500">{ROLE_HINT[inv.role]}</p>
      <p className="mt-1 text-xs text-zinc-500">Vale até {fmt.format(new Date(inv.expiresAt))}.</p>

      <div className="mt-5">
        {!session ? (
          <div className="flex flex-col gap-2">
            <Link href={`/login?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(back)}`} className={buttonClass("primary", "justify-center")}>
              Entrar com {inv.email}
            </Link>
            <div className="mt-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <InviteActions token={token} canAccept={false} />
            </div>
          </div>
        ) : wrongUser ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              Você está logado como <strong>{session.email}</strong>, mas o convite é para <strong>{inv.email}</strong>. Saia e entre com esse
              e-mail para aceitar.
            </p>
            <form action="/api/auth/logout" method="post">
              <input type="hidden" name="next" value={`/login?email=${encodeURIComponent(inv.email)}&next=${encodeURIComponent(back)}`} />
              <button className={buttonClass("primary", "w-full justify-center")}>Sair e entrar com {inv.email}</button>
            </form>
          </div>
        ) : (
          <InviteActions token={token} canAccept />
        )}
      </div>
    </Shell>
  );
}
