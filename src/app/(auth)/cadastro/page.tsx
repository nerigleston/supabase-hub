import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/app-ui";
import { AuthHeader } from "@/components/auth-fields";
import { SignUpForm } from "@/components/auth-forms";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  if (!env.signupOpen) {
    const request = env.accessRequestUrl;
    return (
      <>
        <AuthHeader
          title="Cadastro fechado por enquanto"
          subtitle="Estamos liberando novas contas aos poucos. Já tem conta? É só entrar."
        />
        <div className="flex flex-col gap-3">
          {request && (
            <a href={request} className={buttonClass("primary", "h-10 w-full")}>Quero ser avisado</a>
          )}
          <Link href="/login" className={buttonClass(request ? "secondary" : "primary", "h-10 w-full")}>Entrar</Link>
        </div>
      </>
    );
  }
  return (
    <>
      <AuthHeader title="Criar conta" subtitle="Leva menos de um minuto." />
      <SignUpForm />
    </>
  );
}
