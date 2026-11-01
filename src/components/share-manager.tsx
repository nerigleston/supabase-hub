"use client";

import { useState, useTransition } from "react";
import { changeRoleAction, inviteAction, resendInviteAction, revokeAction, setMemberMcpAction } from "@/app/share-actions";
import { GUEST_ROLES, type GuestRole, MCP_CEILING, MCP_TOOL_LABEL, mcpForMember, ROLE_HINT, ROLE_LABEL } from "@/lib/roles";
import { buttonClass, Card, inputClass, Tone } from "./app-ui";
import { ConfirmAction, Spinner } from "./confirm-action";
import { CopyField } from "./copy-field";
import { toast } from "./toast";

export type MemberView = {
  email: string;
  role: GuestRole;
  status: "pending" | "active";
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  inviteExpiresAt?: string;
  /** calculado no servidor */
  expired?: boolean;
  mcpTools?: string[];
};

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function RolePicker({ value, onChange, name }: { value: GuestRole; onChange: (r: GuestRole) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label="Papel" className="grid gap-2 sm:grid-cols-3">
      {GUEST_ROLES.map((r) => (
        <label
          key={r}
          className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500/40 ${
            value === r
              ? "border-emerald-500 bg-emerald-50/60 dark:border-emerald-600 dark:bg-emerald-950/30"
              : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40"
          }`}
        >
          <span className="flex items-center gap-2 font-medium">
            <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} className="accent-emerald-600" />
            {ROLE_LABEL[r]}
          </span>
          <span className="text-xs text-zinc-500">{ROLE_HINT[r]}</span>
        </label>
      ))}
    </div>
  );
}

function MemberMcp({ org, projectRef, m }: { org: string; projectRef: string; m: MemberView }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(mcpForMember(m.role, m.mcpTools)));
  const [pending, start] = useTransition();
  const ceiling = MCP_CEILING[m.role];
  const save = () =>
    start(async () => {
      const r = await setMemberMcpAction(org, projectRef, m.email, [...sel]);
      toast(r.ok, r.message);
      if (r.ok) setOpen(false);
    });
  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        MCP: {mcpForMember(m.role, m.mcpTools).length} de {ceiling.length} ações {m.mcpTools ? "(personalizado)" : "(padrão do papel)"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">
            O que esta pessoa pode fazer neste banco pelo assistente (Claude, ChatGPT...). Só aparecem as ações que o papel {ROLE_LABEL[m.role]} permite.
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ceiling.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sel.has(t)}
                  onChange={(e) =>
                    setSel((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(t);
                      else next.delete(t);
                      return next;
                    })
                  }
                  className="accent-emerald-600"
                />
                {MCP_TOOL_LABEL[t] ?? t}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={save} className={buttonClass("primary", "text-xs")}>
              {pending && <Spinner />} Salvar
            </button>
            <button type="button" onClick={() => setSel(new Set(MCP_CEILING[m.role]))} className={buttonClass("ghost", "text-xs")}>
              Voltar ao padrão do papel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ShareManager({
  org,
  projectRef,
  me,
  owner,
  members,
  blocked,
}: {
  org: string;
  projectRef: string;
  me: string;
  owner: string;
  members: MemberView[];
  /** motivo para não poder convidar (ex.: plano), ou null */
  blocked: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<GuestRole>("leitura");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const invite = () =>
    start(async () => {
      setLink(null);
      const r = await inviteAction(org, projectRef, email, role);
      toast(r.ok, r.message);
      if (r.ok) {
        setEmail("");
        if (r.data?.link) setLink(r.data.link);
      }
    });

  const resend = (target: string) => {
    setBusy(target);
    start(async () => {
      const r = await resendInviteAction(org, projectRef, target);
      toast(r.ok, r.message);
      if (r.data?.link) setLink(r.data.link);
      setBusy(null);
    });
  };

  const setMemberRole = (target: string, next: string) => {
    setBusy(target);
    start(async () => {
      const r = await changeRoleAction(org, projectRef, target, next);
      toast(r.ok, r.message);
      setBusy(null);
    });
  };

  const active = members.filter((m) => m.status === "active");
  const invites = members.filter((m) => m.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-semibold">Convidar pessoa</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Só para quem já tem conta no BaseHub. O convite chega por e-mail e vale por 7 dias; a pessoa entra e aceita.
          </p>
        </div>
        {blocked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">{blocked}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              invite();
            }}
            className="flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">E-mail</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoComplete="off"
                placeholder="pessoa@empresa.com"
                className={`${inputClass} sm:max-w-sm`}
              />
            </label>
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1 font-medium">Papel</legend>
              <RolePicker value={role} onChange={setRole} name="new-role" />
            </fieldset>
            <div>
              <button disabled={pending || !email} className={buttonClass("primary")}>
                {pending && !busy && <Spinner />} Enviar convite
              </button>
            </div>
          </form>
        )}
        {link && (
          <div className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <CopyField label="Link do convite (envie você mesmo)" value={link} hint="Funciona só para o e-mail convidado" />
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Quem tem acesso</h2>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="min-w-0 truncate text-sm font-medium">
              {owner}
              {owner === me && <span className="ml-1 text-xs font-normal text-zinc-500">(você)</span>}
            </span>
            <Tone tone="ok">Dono</Tone>
          </li>
          {active.map((m) => (
            <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {m.email}
                  {m.email === me && <span className="ml-1 text-xs font-normal text-zinc-500">(você)</span>}
                </span>
                <span className="block text-xs text-zinc-500">
                  Aceitou em {m.acceptedAt ? fmt.format(new Date(m.acceptedAt)) : "?"} · convidado por {m.invitedBy}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {m.email === me ? (
                  <Tone tone="ok">{ROLE_LABEL[m.role]}</Tone>
                ) : (
                  <select
                    aria-label={`Papel de ${m.email}`}
                    value={m.role}
                    disabled={busy === m.email}
                    onChange={(e) => setMemberRole(m.email, e.target.value)}
                    className="h-8 rounded-md border border-zinc-200 bg-transparent px-2 text-xs dark:border-zinc-700"
                  >
                    {GUEST_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                )}
                {m.email !== me && (
                  <ConfirmAction
                    label="Revogar"
                    variant="ghost"
                    pendingLabel="Revogando…"
                    confirm={{
                      title: `Revogar o acesso de ${m.email}?`,
                      body: "A pessoa perde o acesso a este banco na hora, no painel e no MCP. Ela recebe um e-mail avisando.",
                      confirmLabel: "Revogar acesso",
                      danger: true,
                    }}
                    action={() => revokeAction(org, projectRef, m.email)}
                  />
                )}
              </span>
              {m.email !== me && <MemberMcp key={`${m.role}-${(m.mcpTools ?? []).join()}`} org={org} projectRef={projectRef} m={m} />}
            </li>
          ))}
        </ul>
        {!active.length && <p className="text-sm text-zinc-500">Ninguém além do dono tem acesso ainda.</p>}
      </Card>

      {invites.length > 0 && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Convites pendentes</h2>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {invites.map((m) => {
              const expired = Boolean(m.expired);
              return (
                <li key={m.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{m.email}</span>
                    <span className="block text-xs text-zinc-500">
                      {ROLE_LABEL[m.role]} · enviado por {m.invitedBy} em {fmt.format(new Date(m.invitedAt))} ·{" "}
                      {expired ? (
                        <span className="text-rose-600 dark:text-rose-400">expirado</span>
                      ) : (
                        `vale até ${m.inviteExpiresAt ? fmt.format(new Date(m.inviteExpiresAt)) : "?"}`
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <button type="button" disabled={busy === m.email} onClick={() => resend(m.email)} className={buttonClass("secondary", "text-xs")}>
                      {busy === m.email && <Spinner />} Reenviar
                    </button>
                    <ConfirmAction
                      label="Cancelar"
                      variant="ghost"
                      pendingLabel="Cancelando…"
                      confirm={{ title: `Cancelar o convite para ${m.email}?`, body: "O link do convite deixa de funcionar.", confirmLabel: "Cancelar convite" }}
                      action={() => revokeAction(org, projectRef, m.email)}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
