import type { ProjectStatus } from "./supabase-api";

// Vocabulário do usuário, não do sistema (heurística 2).
export type StatusTone = "ok" | "paused" | "busy" | "error";

export const STATUS: Record<ProjectStatus, { label: string; tone: StatusTone; hint: string }> = {
  ACTIVE_HEALTHY: { label: "No ar", tone: "ok", hint: "Banco ativo e saudável." },
  ACTIVE_UNHEALTHY: { label: "Com problema", tone: "error", hint: "Ativo, mas algum serviço não responde." },
  INACTIVE: { label: "Pausado", tone: "paused", hint: "Pausado (inatividade ou manual). Pode ser reativado." },
  PAUSING: { label: "Pausando…", tone: "busy", hint: "O Supabase está pausando o projeto." },
  GOING_DOWN: { label: "Desligando…", tone: "busy", hint: "O projeto está sendo desligado." },
  RESTORING: { label: "Reativando…", tone: "busy", hint: "Leva alguns minutos. A página atualiza sozinha." },
  COMING_UP: { label: "Subindo…", tone: "busy", hint: "O projeto está iniciando." },
  RESTARTING: { label: "Reiniciando…", tone: "busy", hint: "O projeto está reiniciando." },
  UPGRADING: { label: "Atualizando…", tone: "busy", hint: "Atualização do Postgres em andamento." },
  RESIZING: { label: "Redimensionando…", tone: "busy", hint: "Mudança de instância em andamento." },
  RESTORE_FAILED: { label: "Falha ao reativar", tone: "error", hint: "Tente reativar de novo ou abra no Supabase." },
  PAUSE_FAILED: { label: "Falha ao pausar", tone: "error", hint: "Tente de novo ou abra no Supabase." },
  INIT_FAILED: { label: "Falha na criação", tone: "error", hint: "O projeto não chegou a subir. Abra no Supabase." },
  REMOVED: { label: "Removido", tone: "error", hint: "Projeto excluído." },
  UNKNOWN: { label: "Desconhecido", tone: "error", hint: "O Supabase não informou o estado." },
};

export const BUSY_STATUSES = new Set<ProjectStatus>(
  (Object.keys(STATUS) as ProjectStatus[]).filter((s) => STATUS[s].tone === "busy"),
);

/** Estados que ocupam vaga de projeto ativo no plano Free (limite: 2 por login Supabase). */
export const COUNTS_AS_ACTIVE = new Set<ProjectStatus>([
  "ACTIVE_HEALTHY",
  "ACTIVE_UNHEALTHY",
  "COMING_UP",
  "RESTORING",
  "RESTARTING",
  "UPGRADING",
  "RESIZING",
]);

export const FREE_PLAN_ACTIVE_LIMIT = 2;

export const REGIONS: { code: string; label: string }[] = [
  { code: "sa-east-1", label: "São Paulo (sa-east-1)" },
  { code: "us-east-1", label: "Virgínia do Norte (us-east-1)" },
  { code: "us-east-2", label: "Ohio (us-east-2)" },
  { code: "us-west-1", label: "Califórnia (us-west-1)" },
  { code: "eu-central-1", label: "Frankfurt (eu-central-1)" },
  { code: "eu-west-1", label: "Irlanda (eu-west-1)" },
  { code: "eu-west-2", label: "Londres (eu-west-2)" },
  { code: "ap-southeast-1", label: "Singapura (ap-southeast-1)" },
];

export function regionLabel(code: string) {
  return REGIONS.find((r) => r.code === code)?.label ?? code;
}
