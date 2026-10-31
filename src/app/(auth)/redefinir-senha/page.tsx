import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth-fields";
import { ResetForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nova senha" };

export default async function RedefinirSenhaPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const { email } = await searchParams;
  if (typeof email !== "string") redirect("/esqueci-senha");
  return (
    <>
      <AuthHeader
        title="Crie uma nova senha"
        subtitle={<>Se existir uma conta para <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong>, o código chega em instantes. Confira o spam.</>}
      />
      <ResetForm email={email} />
    </>
  );
}
