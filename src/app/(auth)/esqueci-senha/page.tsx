import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth-fields";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function EsqueciSenhaPage({ searchParams }: PageProps<"/esqueci-senha">) {
  const { email } = await searchParams;
  return (
    <>
      <AuthHeader step="Passo 1 de 3" title="Esqueceu a senha?" subtitle="Informe seu e-mail e enviaremos um código para criar uma nova senha." />
      <ForgotForm email={typeof email === "string" ? email : undefined} />
    </>
  );
}
