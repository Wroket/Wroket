"use client";

import { useEffect, useId, useRef, useState } from "react";

import { stickyAnchor } from "@/components/notes/diagramAnchors";
import { diagramColor, diagramPaint, diagramShape, diagramShapeClass, type DiagramColor, type DiagramShape } from "@/components/notes/diagramStyle";
import type { NoteDiagramEdge } from "@/lib/api/notes";

export interface CanvasBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: DiagramShape;
  color?: DiagramColor;
  selected?: boolean;
}

interface DiagramCanvasProps {
  imageUrl?: string | null;
  nodes: CanvasBox[];
  edges: NoteDiagramEdge[];
  editable?: boolean;
  /** Fixed frame height in pixels. The photo stays in proportion inside it. */
  height?: number;
  /** Style applied to the zone currently being drawn. */
  drawShape?: DiagramShape;
  drawColor?: DiagramColor;
  onCreate: (box: { x: number; y: number; w: number; h: number }) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize?: (id: string, x: number, y: number, w: number, h: number) => void;
  resizeLabel?: string;
  /** Drag a blue point onto another zone. */
  onLink?: (from: string, to: string) => void;
  onUnlink?: (from: string, to: string) => void;
  linkLabel?: string;
  unlinkLabel?: string;
  /** Rename the words inside a zone. */
  onLabel?: (id: string, label: string) => void;
  onDelete?: (id: string) => void;
  /** When this id changes, that zone opens for typing. */
  labelEditId?: string | null;
  labelPlaceholder?: string;
  removeLabel?: string;
  onSelect: (id: string) => void;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function hitNode(x: number, y: number, nodes: CanvasBox[], except?: string): CanvasBox | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (!node || node.id === except) continue;
    if (x >= node.x && x <= node.x + node.w && y >= node.y && y <= node.y + node.h) return node;
  }
  return undefined;
}

interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Letterboxed photo inside the frame. Without a photo, the whole frame is the paper. */
function imageContent(frameW: number, frameH: number, imgW: number, imgH: number): PixelBox {
  if (frameW <= 0 || frameH <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  if (imgW <= 0 || imgH <= 0) return { x: 0, y: 0, w: frameW, h: frameH };
  const scale = Math.min(frameW / imgW, frameH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

/**
 * Photo as the canvas. Drag on empty paper to draw a box, drag a box to move it.
 * Coordinates are fractions of the photo so they survive a resize.
 */
export default function DiagramCanvas({
  imageUrl,
  nodes,
  edges,
  editable = true,
  height,
  drawShape = "rect",
  drawColor = "emerald",
  onCreate,
  onMove,
  onResize,
  resizeLabel = "Resize",
  onLink,
  onUnlink,
  linkLabel = "Link",
  unlinkLabel = "Remove link",
  onLabel,
  onDelete,
  labelEditId = null,
  labelPlaceholder = "",
  removeLabel = "Remove",
  onSelect,
}: DiagramCanvasProps) {
  const markerId = useId().replace(/:/g, "");
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<
    | { kind: "draw"; x: number; y: number }
    | { kind: "move"; id: string; dx: number; dy: number }
    | { kind: "resize"; id: string; x: number; y: number }
    | { kind: "link"; from: string }
    | null
  >(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [linkDraft, setLinkDraft] = useState<{ from: string; x: number; y: number; ox: number; oy: number } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (labelEditId) setEditingId(labelEditId);
  }, [labelEditId]);
  const [content, setContent] = useState<PixelBox>({ x: 0, y: 0, w: 1, h: 1 });
  const [frameSize, setFrameSize] = useState({ w: 1, h: 1 });
  const fixed = typeof height === "number";

  useEffect(() => {
    if (!fixed) return;
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const bounds = frame.getBoundingClientRect();
      const img = imgRef.current;
      setFrameSize({ w: bounds.width, h: bounds.height });
      setContent(imageContent(bounds.width, bounds.height, img?.naturalWidth ?? 0, img?.naturalHeight ?? 0));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fixed, imageUrl, height]);

  const point = (event: React.PointerEvent) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return { x: 0, y: 0 };
    if (!fixed || content.w <= 0 || content.h <= 0) {
      return {
        x: clamp((event.clientX - bounds.left) / bounds.width),
        y: clamp((event.clientY - bounds.top) / bounds.height),
      };
    }
    return {
      x: clamp((event.clientX - bounds.left - content.x) / content.w),
      y: clamp((event.clientY - bounds.top - content.y) / content.h),
    };
  };

  const boxStyle = (node: { x: number; y: number; w: number; h: number }) => {
    if (!fixed || frameSize.w <= 1) {
      return { left: `${node.x * 100}%`, top: `${node.y * 100}%`, width: `${node.w * 100}%`, height: `${node.h * 100}%` };
    }
    return {
      left: content.x + node.x * content.w,
      top: content.y + node.y * content.h,
      width: node.w * content.w,
      height: node.h * content.h,
    };
  };

  const linePoint = (x: number, y: number) => {
    if (!fixed || frameSize.w <= 1 || frameSize.h <= 1) return { x: x * 100, y: y * 100 };
    return {
      x: ((content.x + x * content.w) / frameSize.w) * 100,
      y: ((content.y + y * content.h) / frameSize.h) * 100,
    };
  };

  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div
      ref={frameRef}
      style={fixed ? { height } : undefined}
      tabIndex={editable ? 0 : undefined}
      onKeyDown={(event) => {
        if (!editable || editingId || !onDelete) return;
        if (event.key !== "Delete" && event.key !== "Backspace") return;
        const selected = nodes.find((node) => node.selected);
        if (!selected) return;
        event.preventDefault();
        onDelete(selected.id);
      }}
      className={`relative max-w-full touch-none select-none overflow-hidden rounded-md outline-none ${fixed || !imageUrl ? "block w-full" : "inline-block"}`}
      onPointerDown={(event) => {
        if (!editable || event.button !== 0) return;
        const start = point(event);
        drag.current = { kind: "draw", x: start.x, y: start.y };
        setDraft({ x: start.x, y: start.y, w: 0, h: 0 });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.kind !== "draw") return;
        const cursor = point(event);
        setDraft({
          x: Math.min(current.x, cursor.x),
          y: Math.min(current.y, cursor.y),
          w: Math.abs(cursor.x - current.x),
          h: Math.abs(cursor.y - current.y),
        });
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        drag.current = null;
        if (current?.kind === "draw") {
          const cursor = point(event);
          const box = {
            x: Math.min(current.x, cursor.x),
            y: Math.min(current.y, cursor.y),
            w: Math.abs(cursor.x - current.x),
            h: Math.abs(cursor.y - current.y),
          };
          if (box.w >= 0.04 && box.h >= 0.04) onCreate(box);
        }
        setDraft(null);
      }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          draggable={false}
          onLoad={() => {
            const frame = frameRef.current;
            const img = imgRef.current;
            if (!fixed || !frame || !img) return;
            const bounds = frame.getBoundingClientRect();
            setFrameSize({ w: bounds.width, h: bounds.height });
            setContent(imageContent(bounds.width, bounds.height, img.naturalWidth, img.naturalHeight));
          }}
          className={fixed ? "absolute inset-0 h-full w-full object-contain" : "block h-auto max-h-[70vh] w-auto max-w-full"}
        />
      ) : (
        <div className={fixed ? "h-full w-full bg-zinc-50 dark:bg-slate-800" : "h-72 w-full min-w-[16rem] bg-zinc-50 dark:bg-slate-800"} />
      )}
      <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 Z" fill="#059669" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const startAnchor = stickyAnchor(from, to.x + to.w / 2, to.y + to.h / 2);
          const endAnchor = stickyAnchor(to, from.x + from.w / 2, from.y + from.h / 2);
          const start = linePoint(startAnchor.x, startAnchor.y);
          const end = linePoint(endAnchor.x, endAnchor.y);
          return (
            <g key={`${edge.from}>${edge.to}`}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="transparent"
                strokeWidth="8"
                vectorEffect="non-scaling-stroke"
                className={onUnlink ? "cursor-pointer" : ""}
                style={{ pointerEvents: onUnlink ? "stroke" : "none" }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onUnlink?.(edge.from, edge.to);
                }}
              >
                <title>{unlinkLabel}</title>
              </line>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="#059669"
                strokeWidth="1.6"
                vectorEffect="non-scaling-stroke"
                markerEnd={`url(#${markerId})`}
                style={{ pointerEvents: "none" }}
              />
            </g>
          );
        })}
        {linkDraft && byId.has(linkDraft.from) && (() => {
          const start = linePoint(linkDraft.ox, linkDraft.oy);
          const end = linePoint(linkDraft.x, linkDraft.y);
          return (
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#0284c7" strokeWidth="1.6" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" markerEnd={`url(#${markerId})`} style={{ pointerEvents: "none" }} />
          );
        })()}
      </svg>
      {nodes.map((node) => (
        <div
          key={node.id}
          role="button"
          tabIndex={-1}
          aria-label={node.label || labelPlaceholder || node.id}
          className={`absolute z-10 flex items-center justify-center overflow-hidden border-2 px-1 text-center text-[11px] leading-tight text-zinc-900 ${diagramShapeClass(diagramShape(node.shape))} ${node.selected || node.id === hoverId ? "ring-2 ring-emerald-400" : ""}`}
          style={{
            ...boxStyle(node),
            borderColor: diagramPaint(diagramColor(node.color)).border,
            background: diagramPaint(diagramColor(node.color)).fill,
          }}
          onPointerEnter={() => setHoverId(node.id)}
          onPointerLeave={() => setHoverId((current) => current === node.id ? null : current)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (!editable || !onLabel) return;
            setEditingId(node.id);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (!editable || editingId === node.id) return;
            frameRef.current?.focus({ preventScroll: true });
            const cursor = point(event);
            drag.current = { kind: "move", id: node.id, dx: cursor.x - node.x, dy: cursor.y - node.y };
            onSelect(node.id);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.kind !== "move" || current.id !== node.id) return;
            const cursor = point(event);
            onMove(node.id, clamp(cursor.x - current.dx, 0, 1 - node.w), clamp(cursor.y - current.dy, 0, 1 - node.h));
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            drag.current = null;
          }}
        >
          {editingId === node.id && onLabel ? (
            <input
              autoFocus
              value={node.label}
              placeholder={labelPlaceholder}
              aria-label={labelPlaceholder || node.id}
              onChange={(event) => onLabel(node.id, event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  setEditingId(null);
                }
              }}
              onBlur={() => setEditingId(null)}
              className="w-full bg-transparent text-center text-[11px] text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          ) : (
            <span className={node.label ? "" : "text-zinc-400"}>{node.label || labelPlaceholder}</span>
          )}
        </div>
      ))}
      {editable && onLink && nodes.filter((node) => node.selected || node.id === hoverId).map((node) => (
        <span key={`${node.id}-anchors`} className="contents">
        {[
          { x: node.x + node.w / 2, y: node.y },
          { x: node.x + node.w, y: node.y + node.h / 2 },
          { x: node.x + node.w / 2, y: node.y + node.h },
          { x: node.x, y: node.y + node.h / 2 },
        ].map((anchor, index) => (
          <div
            key={`${node.id}-link-${index}`}
            role="button"
            aria-label={linkLabel}
            className="absolute z-30 h-3 w-3 cursor-crosshair rounded-full border-2 border-white bg-sky-500"
            style={{ ...boxStyle({ x: anchor.x, y: anchor.y, w: 0, h: 0 }), width: 12, height: 12, transform: "translate(-6px, -6px)" }}
            onPointerDown={(event) => {
              event.stopPropagation();
              drag.current = { kind: "link", from: node.id };
              setLinkDraft({ from: node.id, x: anchor.x, y: anchor.y, ox: anchor.x, oy: anchor.y });
              onSelect(node.id);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current || current.kind !== "link" || current.from !== node.id) return;
              const cursor = point(event);
              setLinkDraft((current) => current ? { ...current, x: cursor.x, y: cursor.y } : current);
              setHoverId(hitNode(cursor.x, cursor.y, nodes, node.id)?.id ?? null);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              const current = drag.current;
              drag.current = null;
              if (current?.kind === "link") {
                const cursor = point(event);
                const target = hitNode(cursor.x, cursor.y, nodes, current.from);
                if (target) onLink(current.from, target.id);
              }
              setLinkDraft(null);
            }}
          />
        ))}
        </span>
      ))}
      {editable && onDelete && nodes.filter((node) => node.selected && editingId !== node.id).map((node) => (
        <button
          key={`${node.id}-remove`}
          type="button"
          aria-label={removeLabel}
          className="absolute z-30 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none text-white"
          style={{ ...boxStyle({ x: node.x + node.w, y: node.y, w: 0, h: 0 }), width: 16, height: 16, transform: "translate(-8px, -8px)" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(node.id);
          }}
        >
          ×
        </button>
      ))}
      {editable && onResize && nodes.filter((node) => node.selected).map((node) => (
        <div
          key={`${node.id}-resize`}
          role="button"
          aria-label={resizeLabel}
          className="absolute z-20 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-zinc-700"
          style={{ ...boxStyle({ x: node.x + node.w, y: node.y + node.h, w: 0, h: 0 }), width: 12, height: 12, transform: "translate(-6px, -6px)" }}
          onPointerDown={(event) => {
            event.stopPropagation();
            drag.current = { kind: "resize", id: node.id, x: node.x, y: node.y };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.kind !== "resize" || current.id !== node.id) return;
            const cursor = point(event);
            onResize(
              node.id,
              current.x,
              current.y,
              clamp(cursor.x - current.x, 0.04, 1 - current.x),
              clamp(cursor.y - current.y, 0.04, 1 - current.y),
            );
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            drag.current = null;
          }}
        />
      ))}
      {draft && draft.w > 0 && draft.h > 0 && (
        <div
          className={`pointer-events-none absolute border-2 border-dashed ${diagramShapeClass(drawShape)}`}
          style={{ ...boxStyle(draft), borderColor: diagramPaint(drawColor).border, background: diagramPaint(drawColor).fill }}
        />
      )}
    </div>
  );
}
