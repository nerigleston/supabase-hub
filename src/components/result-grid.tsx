"use client";

function cell(value: unknown) {
  if (value === null || value === undefined) return <span className="text-zinc-400 italic">null</span>;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadCsv(filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ResultGrid({
  columns,
  rows,
  types,
  stickyFirst = false,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  types?: Record<string, string>;
  /** Fixa a primeira coluna ao rolar para o lado (bom para tabelas com id). */
  stickyFirst?: boolean;
}) {
  if (!columns.length) return <p className="p-4 text-sm text-zinc-500">Comando executado. Nenhuma linha retornada.</p>;

  // A célula fixa herda o fundo da própria linha (bg-inherit), então a listra
  // zebrada e o hover batem com o resto da linha, sem destoar.
  const firstColHeader = stickyFirst ? "sticky left-0 z-20 bg-zinc-100 dark:bg-zinc-800" : "";
  const firstColCell = stickyFirst ? "sticky left-0 z-10 bg-inherit" : "";

  return (
    <div className="flex flex-col">
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c}
                  className={`border-b border-zinc-200 bg-zinc-100 px-3 py-2 text-left font-semibold whitespace-nowrap text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 ${i === 0 ? firstColHeader : ""} ${i === 0 && stickyFirst ? "dark:bg-zinc-800" : ""}`}
                >
                  {c}
                  {types?.[c] && <span className="ml-1.5 font-normal text-zinc-400 lowercase">{types[c]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-zinc-50 hover:bg-emerald-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900 dark:hover:bg-emerald-950/30">
                {columns.map((c, j) => (
                  <td
                    key={c}
                    className={`max-w-xs truncate border-b border-zinc-100 px-3 py-1.5 font-mono dark:border-zinc-800/60 ${j === 0 ? firstColCell : ""}`}
                    title={typeof r[c] === "string" ? (r[c] as string) : undefined}
                  >
                    {cell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800">
        {rows.length} linha{rows.length === 1 ? "" : "s"} · {columns.length} coluna{columns.length === 1 ? "" : "s"}
      </div>
    </div>
  );
}
