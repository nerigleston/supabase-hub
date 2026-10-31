import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth-fields";
import { NewPasswordForm } from "@/components/auth-forms";
import { getChallenge } from "@/lib/session";

export const metadata: Metadata = { title: "Definir senha" };

export default async function NovaSenhaPage() {
  const challenge = await getChallenge();
  if (!challenge) redirect("/login?erro=expirado");
  return (
    <>
      <AuthHeader title="Defina sua senha" subtitle={<>Primeiro acesso de <strong className="text-zinc-800 dark:text-zinc-200">{challenge.email}</strong>. Escolha uma senha definitiva.</>} />
      <NewPasswordForm />
    </>
  );
}
