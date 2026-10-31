"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
import { THEME_KEY as KEY } from "@/lib/theme";


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

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Claro", icon: "☀" },
  { value: "dark", label: "Escuro", icon: "☾" },
  { value: "system", label: "Sistema", icon: "◐" },
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
    <div role="radiogroup" aria-label="Tema" className="inline-flex rounded-md border border-zinc-200 p-0.5 dark:border-zinc-700">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => choose(o.value)}
          title={o.label}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
            theme === o.value
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          <span aria-hidden>{o.icon}</span>
          {!compact && o.label}
        </button>
      ))}
    </div>
  );
}
