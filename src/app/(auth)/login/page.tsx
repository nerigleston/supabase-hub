import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth-fields";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

const INFO: Record<string, string> = {
  confirmado: "E-mail confirmado! Agora é só entrar.",
  senha: "Senha alterada. Entre com a nova senha.",
  saiu: "Você saiu da sua conta.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : undefined;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const key = Object.keys(INFO).find((k) => sp[k]);
  const info = sp.erro === "expirado" ? undefined : key ? INFO[key] : undefined;

  return (
    <>
      <AuthHeader title="Entrar" subtitle="Acesse o painel das suas contas Supabase." />
      <LoginForm email={email} next={next} info={sp.erro === "expirado" ? "A sessão de troca de senha expirou. Entre de novo." : info} />
    </>
  );
}
