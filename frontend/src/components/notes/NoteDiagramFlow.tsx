"use client";

import type { NoteDiagram, NoteDiagramNode } from "@/lib/api/notes";

function hasBox(node: NoteDiagramNode): node is NoteDiagramNode & { x: number; y: number; w: number; h: number } {
  return typeof node.x === "number" && typeof node.y === "number" && typeof node.w === "number" && typeof node.h === "number";
}

/**
 * Saved workflow. Boxes drawn on the photo keep their place.
 * A graph without positions stays a column list.
 */
export default function NoteDiagramFlow({ diagram }: { diagram: NoteDiagram }) {
  const positioned = diagram.nodes.every(hasBox);
  const byId = new Map(diagram.nodes.map((node) => [node.id, node.label]));

  if (positioned) {
    return (
      <div className="relative h-56 w-full rounded-md bg-zinc-50 dark:bg-slate-800">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {diagram.edges.map((edge) => {
            const from = diagram.nodes.find((node) => node.id === edge.from);
            const to = diagram.nodes.find((node) => node.id === edge.to);
            if (!from || !to || !hasBox(from) || !hasBox(to)) return null;
            return (
              <line
                key={`${edge.from}>${edge.to}`}
                x1={(from.x + from.w / 2) * 100}
                y1={(from.y + from.h / 2) * 100}
                x2={(to.x + to.w / 2) * 100}
                y2={(to.y + to.h / 2) * 100}
                stroke="#059669"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {diagram.nodes.filter(hasBox).map((node) => (
          <div
            key={node.id}
            className="absolute overflow-hidden rounded border border-emerald-700/80 bg-white/85 px-1 text-[11px] leading-tight text-zinc-900"
            style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%`, width: `${node.w * 100}%`, height: `${node.h * 100}%` }}
          >
            {node.label}
          </div>
        ))}
      </div>
    );
  }

  const columns = new Map<string, NoteDiagram["nodes"]>();
  for (const node of diagram.nodes) {
    const key = node.column?.trim() || "";
    const list = columns.get(key) ?? [];
    list.push(node);
    columns.set(key, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {[...columns.entries()].map(([column, nodes]) => (
          <div key={column || "default"} className="min-w-[10rem] flex-1 space-y-1.5">
            {column && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400">{column}</p>
            )}
            {nodes.map((node) => (
              <div
                key={node.id}
                className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/30 px-2.5 py-1.5 text-sm text-zinc-800 dark:text-slate-100"
              >
                {node.label}
              </div>
            ))}
          </div>
        ))}
      </div>
      {diagram.edges.length > 0 && (
        <ul className="text-xs text-zinc-600 dark:text-slate-300 space-y-0.5">
          {diagram.edges.map((edge) => (
            <li key={`${edge.from}>${edge.to}`}>
              {byId.get(edge.from) ?? edge.from} → {byId.get(edge.to) ?? edge.to}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
