import { redirect } from "next/navigation";
import { buttonClass } from "@/components/app-ui";
import { Logo } from "@/components/logo";
import { getClient } from "@/lib/oauth";
import { hasMcp, orgUsage } from "@/lib/plans";
import { getSession } from "@/lib/session";

export const metadata = { title: "Autorizar acesso" };

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

export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const responseType = get("response_type");
  const codeChallenge = get("code_challenge");
  const method = get("code_challenge_method");

  const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);

  // Sem sessão: login e volta para cá.
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);

  if (responseType !== "code" || method !== "S256" || !codeChallenge) {
    return <Shell><p className="text-sm text-rose-600">Pedido de autorização inválido.</p></Shell>;
  }
  const client = await getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return <Shell><p className="text-sm text-rose-600">Aplicativo ou URL de retorno não reconhecidos.</p></Shell>;
  }

  const plan = (await orgUsage(session!.tenantId)).plan;
  if (!hasMcp(plan)) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">MCP é do plano Business</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Sua conta ({session!.email}) está no plano {plan}. O acesso via MCP exige o Business.</p>
        <a href="/assinar" className={buttonClass("primary", "mt-4 w-full justify-center")}>Ver o Business</a>
      </Shell>
    );
  }

  // Autorizar é um link (navegação GET), não um form: assim a CSP form-action não
  // bloqueia o redirect para o cliente MCP.
  return (
    <Shell>
      <h1 className="text-lg font-semibold">Autorizar acesso via MCP</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        <strong>{client.name || "Um aplicativo"}</strong> quer acessar sua conta BaseHub (<strong>{session!.email}</strong>) para gerenciar seus bancos
        Supabase pelas ações que você habilitou.
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-xs text-zinc-500">
        <li>• Só as ações ligadas na sua tela de MCP são executadas.</li>
        <li>• Você pode revogar quando quiser desconectando no cliente.</li>
      </ul>
      <div className="mt-5 flex gap-2">
        <a href="/painel" className={buttonClass("secondary", "flex-1 justify-center")}>Cancelar</a>
        <a href={`/oauth/authorize/approve?${params}`} className={buttonClass("primary", "flex-1 justify-center")}>Autorizar</a>
      </div>
    </Shell>
  );
}
