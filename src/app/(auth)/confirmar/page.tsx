import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/auth-fields";
import { ConfirmForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Confirmar e-mail" };

export default async function ConfirmarPage({ searchParams }: PageProps<"/confirmar">) {
  const { email, reenviado } = await searchParams;
  if (typeof email !== "string") redirect("/cadastro");
  return (
    <>
      <AuthHeader
        title="Confirme seu e-mail"
        subtitle={<>Enviamos um código de 6 dígitos para <strong className="text-zinc-800 dark:text-zinc-200">{email}</strong>.</>}
      />
      <ConfirmForm email={email} resent={Boolean(reenviado)} />
    </>
  );
}
