"use client";

import { highlight, languages } from "prismjs";
import "prismjs/components/prism-sql";
import { useMemo } from "react";
import Editor from "react-simple-code-editor";

// Realce de sintaxe SQL + números de linha, mantendo ⌘/Ctrl+Enter e Tab.
// Cores via classes (token-*) definidas em globals.css, para funcionar nos dois temas.

export function SqlCodeEditor({
  value,
  onChange,
  onRun,
  minHeight = 200,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  minHeight?: number;
}) {
  const lineCount = useMemo(() => Math.max(value.split("\n").length, 1), [value]);

  return (
    <div className="sql-editor flex max-h-[55vh] overflow-auto bg-zinc-950 font-mono text-sm leading-6">
      <div aria-hidden className="shrink-0 select-none border-r border-white/10 px-3 py-4 text-right text-zinc-600 tabular-nums">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={(code) => highlight(code, languages.sql, "sql")}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onRun();
          }
        }}
        tabSize={2}
        insertSpaces
        padding={16}
        textareaClassName="outline-none"
        className="min-w-0 flex-1 text-zinc-100"
        style={{ minHeight, fontFamily: "inherit", fontSize: "inherit" }}
        aria-label="Editor SQL"
      />
    </div>
  );
}
