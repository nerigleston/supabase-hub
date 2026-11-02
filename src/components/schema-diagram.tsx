"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyRound, Link2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

// Diagrama das tabelas de um schema e das chaves estrangeiras entre elas (como um
// modelo lógico no brModelo). Tabelas de outros schemas que são referenciadas (ex.:
// auth.users) aparecem tracejadas, só com as colunas usadas.

export type DiagramColumn = {
  schema: string;
  table: string;
  column: string;
  type: string;
  not_null: boolean;
  pk: boolean;
  uniq: boolean;
};

export type DiagramFk = {
  name: string;
  src_schema: string;
  src_table: string;
  src_column: string;
  tgt_schema: string;
  tgt_table: string;
  tgt_column: string;
};

type Col = { name: string; type: string; notNull: boolean; pk: boolean; uniq: boolean; fk: boolean };
type TableData = { label: string; external: boolean; columns: Col[] };
type TableNode = Node<TableData, "table">;

const WIDTH = 270;
const HEADER = 38;
const ROW = 26;
const height = (cols: number) => HEADER + Math.max(cols, 1) * ROW + 8;

function TableCard({ data }: NodeProps<TableNode>) {
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-white text-xs shadow-sm dark:bg-zinc-900 ${
        data.external ? "border-dashed border-zinc-400 dark:border-zinc-600" : "border-zinc-300 dark:border-zinc-700"
      }`}
      style={{ width: WIDTH }}
    >
      <div
        className={`flex items-center px-3 font-semibold ${
          data.external ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" : "bg-emerald-600 text-white"
        }`}
        style={{ height: HEADER }}
      >
        <span className="truncate">{data.label}</span>
      </div>
      <ul className="py-1">
        {data.columns.map((c) => (
          <li key={c.name} className="relative flex items-center gap-1.5 px-3" style={{ height: ROW }}>
            <Handle type="target" position={Position.Left} id={`${c.name}:t`} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
            <span className="flex w-8 shrink-0 items-center gap-0.5">
              {c.pk && <KeyRound aria-label="Chave primária" className="size-3 text-amber-500" />}
              {c.fk && <Link2 aria-label="Chave estrangeira" className="size-3 text-sky-500" />}
            </span>
            <span className={`min-w-0 flex-1 truncate ${c.pk ? "font-semibold" : ""} text-zinc-800 dark:text-zinc-100`}>
              {c.name}
              {!c.notNull && !c.pk && <span className="text-zinc-400">?</span>}
            </span>
            <span className="max-w-[45%] shrink-0 truncate font-mono text-[10px] text-zinc-500">{c.type}</span>
            <Handle type="source" position={Position.Right} id={`${c.name}:s`} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent" />
          </li>
        ))}
      </ul>
    </div>
  );
}

const nodeTypes = { table: TableCard };

/** Monta nós e arestas e posiciona com dagre (da esquerda para a direita). */
function build(schema: string, columns: DiagramColumn[], fks: DiagramFk[]) {
  const tables = new Map<string, TableData>();
  const key = (s: string, t: string) => `${s}.${t}`;
  for (const c of columns) {
    const k = key(c.schema, c.table);
    if (!tables.has(k)) tables.set(k, { label: c.table, external: false, columns: [] });
    tables.get(k)!.columns.push({ name: c.column, type: c.type, notNull: c.not_null, pk: c.pk, uniq: c.uniq, fk: false });
  }
  // tabelas de outros schemas referenciadas: só as colunas usadas
  const ensureExternal = (s: string, t: string, col: string) => {
    const k = key(s, t);
    let tb = tables.get(k);
    if (!tb) {
      tb = { label: `${s}.${t}`, external: true, columns: [] };
      tables.set(k, tb);
    }
    if (tb.external && !tb.columns.some((c) => c.name === col)) tb.columns.push({ name: col, type: "", notNull: true, pk: false, uniq: false, fk: false });
  };
  for (const f of fks) {
    if (f.src_schema !== schema) ensureExternal(f.src_schema, f.src_table, f.src_column);
    if (f.tgt_schema !== schema) ensureExternal(f.tgt_schema, f.tgt_table, f.tgt_column);
    const src = tables.get(key(f.src_schema, f.src_table))?.columns.find((c) => c.name === f.src_column);
    if (src) src.fk = true;
  }

  // uma aresta por coluna da FK; rótulo 1:1 se a coluna for única, senão N:1
  const edges: Edge[] = fks.map((f, i) => {
    const src = tables.get(key(f.src_schema, f.src_table))?.columns.find((c) => c.name === f.src_column);
    const one = Boolean(src?.pk || src?.uniq);
    return {
      id: `${f.name}:${i}`,
      source: key(f.src_schema, f.src_table),
      sourceHandle: `${f.src_column}:s`,
      target: key(f.tgt_schema, f.tgt_table),
      targetHandle: `${f.tgt_column}:t`,
      type: "smoothstep",
      label: one ? "1:1" : "N:1",
      labelStyle: { fontSize: 10, fontWeight: 600 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      style: { strokeWidth: 1.5 },
    };
  });

  // dagre só para quem tem relacionamento; as soltas vão numa grade embaixo
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const [k, t] of tables) if (linked.has(k)) g.setNode(k, { width: WIDTH, height: height(t.columns.length) });
  for (const e of edges) if (e.source !== e.target) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const nodes: TableNode[] = [];
  let maxY = 0;
  for (const [k, t] of tables) {
    if (!linked.has(k)) continue;
    const p = g.node(k);
    const h = height(t.columns.length);
    nodes.push({ id: k, type: "table", data: t, position: { x: p.x - WIDTH / 2, y: p.y - h / 2 } });
    maxY = Math.max(maxY, p.y + h / 2);
  }
  const loose = [...tables].filter(([k]) => !linked.has(k));
  const perRow = Math.max(3, Math.ceil(Math.sqrt(loose.length)));
  let y = nodes.length ? maxY + 80 : 0;
  for (let i = 0; i < loose.length; i += perRow) {
    const row = loose.slice(i, i + perRow);
    row.forEach(([k, t], j) => nodes.push({ id: k, type: "table", data: t, position: { x: j * (WIDTH + 40), y } }));
    y += Math.max(...row.map(([, t]) => height(t.columns.length))) + 40;
  }
  return { nodes, edges, linkedCount: linked.size, total: tables.size };
}

/**
 * Enquadra depois que as tabelas foram medidas (antes disso o fitView erra o zoom).
 * Se o diagrama inteiro ficar pequeno demais para ler, aproxima no centro.
 */
function AutoFit({ signature }: { signature: string }) {
  const ready = useNodesInitialized();
  const { fitView, getZoom, zoomTo } = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    void fitView({ padding: 0.1 }).then(() => {
      if (getZoom() < 0.6) void zoomTo(0.6);
    });
  }, [ready, signature, fitView, getZoom, zoomTo]);
  return null;
}

/** Acompanha a classe .dark do <html> (o tema do app não segue só o sistema). */
function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function SchemaDiagram({
  schema,
  schemas,
  columns,
  fks,
}: {
  schema: string;
  schemas: { schema: string; tables: number }[];
  columns: DiagramColumn[];
  fks: DiagramFk[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const dark = useDark();
  const built = useMemo(() => build(schema, columns, fks), [schema, columns, fks]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>(built.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(built.edges);
  useEffect(() => {
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [built, setNodes, setEdges]);

  const relCount = new Set(fks.map((f) => f.name)).size;

  // passar o mouse numa tabela destaca as ligações dela e apaga as outras
  const [hovered, setHovered] = useState<string | null>(null);
  const shownEdges = useMemo(
    () =>
      hovered
        ? edges.map((e) => {
            const on = e.source === hovered || e.target === hovered;
            return {
              ...e,
              animated: on,
              zIndex: on ? 10 : 0,
              style: { ...e.style, stroke: on ? "#059669" : undefined, opacity: on ? 1 : 0.15, strokeWidth: on ? 2 : 1.5 },
            };
          })
        : edges,
    [edges, hovered],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-zinc-500">Schema</span>
          <select
            value={schema}
            onChange={(e) => router.push(`${pathname}?schema=${encodeURIComponent(e.target.value)}`)}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {schemas.map((s) => (
              <option key={s.schema} value={s.schema}>
                {s.schema} ({s.tables})
              </option>
            ))}
          </select>
        </label>
        <span className="text-zinc-500">
          {built.total - built.nodes.filter((n) => n.data.external).length} tabela(s), {relCount} relacionamento(s)
        </span>
        <span className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><KeyRound className="size-3 text-amber-500" /> chave primária</span>
          <span className="flex items-center gap-1"><Link2 className="size-3 text-sky-500" /> chave estrangeira</span>
          <span>? aceita nulo</span>
          <span>Arraste para mover; zoom com Ctrl/⌘ + roda ou os botões</span>
        </span>
      </div>

      {columns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Nenhuma tabela no schema {schema}.
        </p>
      ) : (
        <div className="h-[78vh] min-h-[520px] overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <ReactFlow
            nodes={nodes}
            edges={shownEdges}
            onNodeMouseEnter={(_, n) => setHovered(n.id)}
            onNodeMouseLeave={() => setHovered(null)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            colorMode={dark ? "dark" : "light"}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            minZoom={0.1}
            // a roda do mouse rola a página; zoom pelos botões, pinça ou Ctrl/Cmd + roda
            zoomOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          >
            <AutoFit signature={`${schema}:${built.nodes.length}`} />
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => ((n as TableNode).data.external ? "#a1a1aa" : "#059669")} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
