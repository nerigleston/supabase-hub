import { ImageResponse } from "next/og";

// Card de compartilhamento (LinkedIn, WhatsApp, X…). Gerado no build e servido em /opengraph-image.
export const alt = "BaseHub: todos os seus bancos Supabase em um só painel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS = [
  { name: "loja-online", status: "No ar", bg: "#052e1c", fg: "#6ee7b7", dot: "#10b981", on: true },
  { name: "app-agenda", status: "Pausado", bg: "#3b1d06", fg: "#fcd34d", dot: "#f59e0b", on: false },
  { name: "crm-vendas", status: "Reativando…", bg: "#082f49", fg: "#7dd3fc", dot: "#0ea5e9", on: false },
];

function Logo({ size: s }: { size: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64">
      <path d="M8 14a9 4.5 0 0 1 18 0v36a9 4.5 0 0 1-18 0z" fill="#10b981" />
      <path d="M38 14a9 4.5 0 0 1 18 0v36a9 4.5 0 0 1-18 0z" fill="#10b981" />
      <rect x="24" y="27.5" width="16" height="9" rx="1" fill="#10b981" />
      <ellipse cx="17" cy="14" rx="9" ry="4.5" fill="#6ee7b7" />
      <ellipse cx="47" cy="14" rx="9" ry="4.5" fill="#6ee7b7" />
      <circle cx="32" cy="32" r="2.6" fill="#09090b" />
    </svg>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#09090b",
          backgroundImage: "radial-gradient(circle at 30% 0%, rgba(16,185,129,0.28), transparent 55%)",
          color: "#fafafa",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* esquerda: marca e mensagem */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Logo size={52} />
            <div style={{ display: "flex", fontSize: 34, letterSpacing: -0.5 }}>
              base<span style={{ fontWeight: 700 }}>hub</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontSize: 58, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>
              Todos os seus bancos Supabase em&nbsp;<span style={{ color: "#34d399" }}>um só painel.</span>
            </div>
            <div style={{ display: "flex", marginTop: 24, fontSize: 26, color: "#a1a1aa", lineHeight: 1.35 }}>
              Vários logins, keep-alive para o banco grátis não pausar, SQL e tabelas sem trocar de conta.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 20, color: "#d4d4d8" }}>
            <div style={{ display: "flex", border: "1px solid #3f3f46", borderRadius: 999, padding: "8px 18px" }}>Open source</div>
            <div style={{ display: "flex", border: "1px solid #3f3f46", borderRadius: 999, padding: "8px 18px" }}>Grátis até 2 organizações</div>
          </div>
        </div>

        {/* direita: prévia do painel */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 470,
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid #27272a" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ display: "flex", width: 11, height: 11, borderRadius: 99, background: "#3f3f46" }} />
              ))}
              <div style={{ display: "flex", marginLeft: 10, fontSize: 16, color: "#a1a1aa" }}>Visão geral</div>
            </div>
            <div style={{ display: "flex", gap: 10, padding: 18 }}>
              {[
                ["Logins", "8"],
                ["Projetos", "20"],
                ["Pausados", "10"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ display: "flex", flexDirection: "column", flex: 1, border: "1px solid #27272a", borderRadius: 12, padding: "10px 14px" }}
                >
                  <div style={{ display: "flex", fontSize: 14, color: "#a1a1aa" }}>{label}</div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: label === "Pausados" ? "#f59e0b" : "#fafafa" }}>{value}</div>
                </div>
              ))}
            </div>
            {ROWS.map((r) => (
              <div
                key={r.name}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: "1px solid #27272a" }}
              >
                <div style={{ display: "flex", fontSize: 19, fontWeight: 600, width: 150 }}>{r.name}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 15,
                    background: r.bg,
                    color: r.fg,
                    borderRadius: 999,
                    padding: "4px 12px",
                  }}
                >
                  <div style={{ display: "flex", width: 8, height: 8, borderRadius: 99, background: r.dot }} />
                  {r.status}
                </div>
                <div
                  style={{
                    display: "flex",
                    width: 44,
                    height: 24,
                    borderRadius: 99,
                    padding: 3,
                    background: r.on ? "#059669" : "#3f3f46",
                    justifyContent: r.on ? "flex-end" : "flex-start",
                  }}
                >
                  <div style={{ display: "flex", width: 18, height: 18, borderRadius: 99, background: "#fff" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
