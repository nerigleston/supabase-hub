import type { NextRequest } from "next/server";
import { addLog, scanEnabledKeepAlive } from "@/lib/db";
import { mapLimit, pingProject } from "@/lib/keepalive";

// Roda 1x por dia pelo Cron da Vercel (vercel.ts). Cada projeto com keep-alive
// ligado recebe um `select 1`, zerando a contagem de 7 dias de inatividade.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // A Vercel envia "Authorization: Bearer <CRON_SECRET>" nas chamadas do cron.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Não autorizado", { status: 401 });
  }

  const started = Date.now();
  const items = await scanEnabledKeepAlive();
  // Um projeto com erro não impede os outros (pingProject nunca lança).
  const results = await mapLimit(items, 8, async (ka) => ({ ka, ...(await pingProject(ka)) }));

  const failed = results.filter((r) => !r.ok);
  await Promise.all(
    failed.map((r) =>
      addLog(r.ka.tenantId, { user: "cron", action: "keepalive_falhou", target: `${r.ka.name} (${r.ka.ref})`, ok: false, detail: r.error }),
    ),
  );

  const summary = { total: items.length, ok: items.length - failed.length, failed: failed.length, ms: Date.now() - started };
  console.log("keepalive", summary);
  return Response.json(summary);
}
