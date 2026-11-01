import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nova senha" };

// Passos 2 (código) e 3 (nova senha) da troca de senha; o cabeçalho muda junto com o passo.
export default async function RedefinirSenhaPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const { email } = await searchParams;
  if (typeof email !== "string") redirect("/esqueci-senha");
  return <ResetForm email={email} />;
}
