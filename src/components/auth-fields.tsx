"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./confirm-action";
import { toast } from "./toast";
import { buttonClass, inputClass } from "./app-ui";

export function AuthHeader({ title, subtitle, step }: { title: string; subtitle?: ReactNode; step?: string }) {
  return (
    <div className="mb-6">
      {step && <p className="mb-2 text-xs font-medium tracking-wide text-emerald-700 uppercase dark:text-emerald-400">{step}</p>}
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
  { label: "Maiúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Minúscula", test: (p: string) => /[a-z]/.test(p) },
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
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Requisitos da senha">
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

/**
 * Código de 6 dígitos em caixas separadas: avança sozinho, aceita colar o código
 * inteiro, Backspace volta e as setas navegam. O valor vai num input escondido
 * (`name`), e o teclado do celular sugere o código recebido (one-time-code).
 */
export function CodeInput({
  name = "code",
  label = "Código recebido por e-mail",
  hint,
  autoFocus = true,
  onComplete,
  disabled = false,
  resetKey,
}: {
  name?: string;
  label?: string;
  hint?: ReactNode;
  autoFocus?: boolean;
  /** chamado quando os 6 dígitos estão preenchidos */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  /** mude o valor para limpar as caixas (ex.: depois de um código errado) */
  resetKey?: number;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus();
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // limpa quando o pai pede (código errado)
  const [seenReset, setSeenReset] = useState(resetKey);
  if (resetKey !== seenReset) {
    setSeenReset(resetKey);
    setDigits(Array(6).fill(""));
  }
  // volta o cursor para a 1ª caixa depois de limpar (quando a conferência libera as caixas)
  useEffect(() => {
    if (resetKey && !disabled) refs.current[0]?.focus();
  }, [resetKey, disabled]);

  // completou os 6 dígitos: avisa o pai (validação automática)
  const code = digits.join("");
  useEffect(() => {
    if (/^\d{6}$/.test(code)) onCompleteRef.current?.(code);
  }, [code]);

  const fill = (start: number, text: string) => {
    const only = text.replace(/\D/g, "").slice(0, 6 - start);
    if (!only) return;
    setDigits((prev) => {
      const next = [...prev];
      only.split("").forEach((d, k) => (next[start + k] = d));
      return next;
    });
    focus(start + only.length);
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span id={`${name}-label`} className="font-medium">{label}</span>
      <input type="hidden" name={name} value={digits.join("")} />
      <div role="group" aria-labelledby={`${name}-label`} className="grid grid-cols-6 gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={autoFocus && i === 0}
            maxLength={6}
            aria-label={`Dígito ${i + 1} de 6`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v.length > 1) return fill(i, v); // colou ou o celular preencheu o código todo
              setDigits((prev) => {
                const next = [...prev];
                next[i] = v;
                return next;
              });
              if (v) focus(i + 1);
            }}
            onPaste={(e) => {
              e.preventDefault();
              fill(i, e.clipboardData.getData("text"));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i]) focus(i - 1);
              if (e.key === "ArrowLeft") focus(i - 1);
              if (e.key === "ArrowRight") focus(i + 1);
            }}
            onFocus={(e) => e.currentTarget.select()}
            disabled={disabled}
            className={`${inputClass} h-12 px-0 text-center font-mono text-xl font-semibold disabled:opacity-60`}
          />
        ))}
      </div>
      {hint && <span className="text-xs text-zinc-500">{hint}</span>}
    </div>
  );
}

/** Nova senha + confirmação, com os requisitos e a conferência das duas ao vivo. */
export function NewPasswordFields({ label = "Nova senha", autoFocus }: { label?: string; autoFocus?: boolean }) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const toggle = (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      aria-label={shown ? "Ocultar senhas" : "Mostrar senhas"}
    >
      {shown ? "Ocultar" : "Mostrar"}
    </button>
  );
  const match = confirm.length > 0 && pwd === confirm;
  return (
    <>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="password" className="font-medium">{label}</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={shown ? "text" : "password"}
            required
            autoFocus={autoFocus}
            autoComplete="new-password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            className={`${inputClass} py-2.5 pr-20`}
          />
          {toggle}
        </div>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Requisitos da senha">
          {RULES.map((r) => {
            const ok = r.test(pwd);
            return (
              <li key={r.label} className={ok ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}>
                <span aria-hidden>{ok ? "✓" : "○"}</span> {r.label}
                <span className="sr-only">{ok ? " (atendido)" : " (pendente)"}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="confirm" className="font-medium">Confirmar {label.toLowerCase()}</label>
        <div className="relative">
          <input
            id="confirm"
            name="confirm"
            type={shown ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-describedby="confirm-status"
            className={`${inputClass} py-2.5 pr-20`}
          />
          {toggle}
        </div>
        <span id="confirm-status" aria-live="polite" className={`text-xs ${!confirm ? "invisible" : match ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
          {match ? "✓ As senhas conferem" : "As senhas ainda não conferem"}
        </span>
      </div>
    </>
  );
}

/** "Reenviar código" com espera de 60 s (o código acabou de ser enviado ao abrir a tela). */
export function ResendCodeButton({ onResend, wait = 60 }: { onResend: () => Promise<Feedback>; wait?: number }) {
  const [left, setLeft] = useState(wait);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <button
      type="button"
      disabled={pending || left > 0}
      onClick={async () => {
        setPending(true);
        const r = await onResend();
        setPending(false);
        if (r?.error) toast(false, r.error);
        else {
          toast(true, r?.info ?? "Enviamos um novo código.");
          setLeft(wait);
        }
      }}
      className="font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline dark:text-emerald-400 dark:disabled:text-zinc-500"
    >
      {pending ? "Enviando…" : left > 0 ? `Reenviar código em ${left}s` : "Reenviar código"}
    </button>
  );
}
