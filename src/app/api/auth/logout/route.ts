import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST(request: NextRequest) {
  await destroySession();
  const form = await request.formData().catch(() => null);
  const next = String(form?.get("next") ?? "");
  // só caminhos internos (evita redirecionamento aberto)
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/login?saiu=1");
}
