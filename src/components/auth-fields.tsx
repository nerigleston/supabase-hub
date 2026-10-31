"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./confirm-action";
import { toast } from "./toast";
import { buttonClass, inputClass } from "./app-ui";

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  aside,
  className = "",
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline justify-between">
        <span className="font-medium">{label}</span>
        {aside}
      </span>
      <input {...input} className={`${inputClass} py-2.5 ${className}`} />
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

/**
 * Campo de e-mail que já normaliza para minúsculo enquanto digita (para bater
 * com o e-mail guardado no Cognito, que o app padroniza em minúsculo) e desliga
 * a maiúscula/correção automática do teclado — importante no celular.
 */
export function EmailField(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; aside?: ReactNode }) {
  return (
    <Field
      type="email"
      inputMode="email"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      onInput={(e) => {
        const el = e.currentTarget;
        const pos = el.selectionStart;
        const lower = el.value.toLowerCase();
        if (lower !== el.value) {
          el.value = lower;
          if (pos !== null) el.setSelectionRange(pos, pos);
        }
      }}
      {...props}
    />
  );
}

const RULES = [
  { label: "12+ caracteres", test: (p: string) => p.length >= 12 },
  { label: "Letra maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Letra minúscula", test: (p: string) => /[a-z]/.test(p) },
  { label: "Número", test: (p: string) => /\d/.test(p) },
];

/** Senha com mostrar/ocultar e, ao criar, requisitos visíveis enquanto digita (heurísticas 1, 5 e 6). */
export function PasswordField({
  label = "Senha",
  name = "password",
  showRules = false,
  autoComplete = "current-password",
  aside,
  autoFocus,
}: {
  label?: string;
  name?: string;
  showRules?: boolean;
  autoComplete?: string;
  aside?: ReactNode;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline justify-between">
        <label htmlFor={name} className="font-medium">{label}</label>
        {aside}
      </span>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={shown ? "text" : "password"}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} py-2.5 pr-20`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={shown ? "Ocultar senha" : "Mostrar senha"}
        >
          {shown ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {showRules && (
        <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label="Requisitos da senha">
          {RULES.map((r) => {
            const ok = r.test(value);
            return (
              <li key={r.label} className={ok ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}>
                <span aria-hidden>{ok ? "✓" : "○"}</span> {r.label}
                <span className="sr-only">{ok ? " (atendido)" : " (pendente)"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel }: { children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary", "w-full py-2.5")}>
      {pending && <Spinner />}
      {pending ? pendingLabel : children}
    </button>
  );
}

type Feedback = { error?: string; info?: string } | null;

/**
 * Erros e avisos dos formulários de autenticação viram toast (heurística 1).
 * Para o erro não sumir com o toast, o formulário fica marcado como inválido
 * (bordas vermelhas) até o usuário editar algum campo (heurística 9).
 */
export function useFormFeedback(state: Feedback, initialInfo?: string) {
  const [editedAfter, setEditedAfter] = useState<Feedback>(null);

  // a cada envio o useActionState devolve um objeto novo: toast mesmo se a mensagem repetir
  useEffect(() => {
    if (state?.error) toast(false, state.error);
    else if (state?.info) toast(true, state.info);
  }, [state]);

  // aviso vindo da URL (ex.: "E-mail confirmado!"), uma vez ao abrir
  useEffect(() => {
    if (initialInfo) toast(true, initialInfo);
  }, [initialInfo]);

  return {
    "data-invalid": state?.error && editedAfter !== state ? "" : undefined,
    onInput: () => setEditedAfter(state),
  };
}
