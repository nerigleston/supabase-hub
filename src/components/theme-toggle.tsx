"use client";

import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme";

export type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const OPTIONS: { value: Theme; label: string; title: string; icon: LucideIcon }[] = [
  { value: "light", label: "Claro", title: "Tema claro", icon: Sun },
  { value: "dark", label: "Escuro", title: "Tema escuro", icon: Moon },
  { value: "system", label: "Sistema", title: "Seguir o sistema", icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  // lê a preferência salva depois da hidratação (o <head> já aplicou a classe)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
  }, []);

  // no modo Sistema, acompanha a troca de tema do sistema operacional
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
    apply(t);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={`${compact ? "grid w-full grid-cols-3" : "inline-flex"} rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80`}
    >
      {OPTIONS.map((o) => {
        const on = theme === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.title}
            onClick={() => choose(o.value)}
            title={o.title}
            className={`flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
              on
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            <Icon aria-hidden className="size-3.5" strokeWidth={2} />
            {!compact && o.label}
          </button>
        );
      })}
    </div>
  );
}
