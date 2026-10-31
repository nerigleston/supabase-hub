import type { Metadata } from "next";
import { AuthHeader } from "@/components/auth-fields";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <>
      <AuthHeader title="Criar conta" subtitle="Grátis. Leva menos de um minuto." />
      <SignUpForm />
    </>
  );
}
