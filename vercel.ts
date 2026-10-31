import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Keep-alive diário: 09:00 UTC (06:00 em Brasília). O Supabase pausa após 7 dias sem atividade.
    { path: "/api/cron/keepalive", schedule: "0 9 * * *" },
  ],
};
