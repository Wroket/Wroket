"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import ApplyDiagramDialog from "@/components/notes/ApplyDiagramDialog";
import DiagramCanvas from "@/components/notes/DiagramCanvas";
import DiagramStyleBar from "@/components/notes/DiagramStyleBar";
import { diagramColor, diagramShape, type DiagramColor, type DiagramShape } from "@/components/notes/diagramStyle";
import { HourglassStatus } from "@/components/notes/HourglassStatus";
import { useToast } from "@/components/Toast";
import { formatUserFacingError } from "@/lib/apiErrors";
import {
  getNoteAttachmentDownloadUrl,
  getNoteAttachments,
  saveNoteDiagram,
  type NoteDiagram,
  type NoteDiagramEdge,
  type NoteDiagramNode,
} from "@/lib/api/notes";
import { useLocale } from "@/lib/LocaleContext";
import type { Project } from "@/lib/api/projects";

interface DraftNode {
  id: string;
  label: string;
  column: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: DiagramShape;
  color: DiagramColor;
}

interface NoteDiagramEditorProps {
  noteId: string;
  diagram: NoteDiagram;
  readOnly?: boolean;
  /** Bumps when a new photo is attached, so the canvas background reloads. */
  refreshKey?: number;
  onSaved?: (diagram?: { nodes: NoteDiagramNode[]; edges: NoteDiagramEdge[] }) => void;
  /** Which diagram block receives the save. A new id appends a block. */
  blockId?: string;
  /** Project choices for turning the boxes into tasks. Absent on a read-only note. */
  apply?: {
    projects: Project[];
    defaultProjectId?: string | null;
    parentId?: string | null;
    onCreated?: () => void;
  };
}

function hasBox(node: NoteDiagramNode): node is NoteDiagramNode & { x: number; y: number; w: number; h: number } {
  return typeof node.x === "number" && typeof node.y === "number" && typeof node.w === "number" && typeof node.h === "number";
}

/** Give every step a box. Steps saved without a position line up across the frame. */
function layoutNodes(diagram: NoteDiagram): DraftNode[] {
  const count = Math.max(diagram.nodes.length, 1);
  return diagram.nodes.map((node, index) => {
    const shape = diagramShape(node.shape);
    const color = diagramColor(node.color);
    if (hasBox(node)) {
      return { id: node.id, label: node.label, column: node.column ?? "", x: node.x, y: node.y, w: node.w, h: node.h, shape, color };
    }
    const w = Math.min(0.26, 0.78 / count);
    const gap = (1 - w * count) / (count + 1);
    return {
      id: node.id,
      label: node.label,
      column: node.column ?? "",
      x: gap + index * (w + gap),
      y: 0.36,
      w,
      h: 0.22,
      shape,
      color,
    };
  });
}

const CANVAS_MIN = 280;
const CANVAS_MAX = 1600;
const CANVAS_DEFAULT = 520;

/** Help control kept beside the “Diagram” label. */
export function DiagramCanvasHelp() {
  const { t } = useLocale();
  const hintId = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={t("notes.diagram.canvasHelp")}
        aria-describedby={hintId}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-semibold leading-none text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
      >
        i
      </button>
      <span
        id={hintId}
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-72 rounded-md bg-zinc-900 p-2 text-xs leading-snug text-white opacity-0 shadow-lg group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {t("notes.diagram.canvasHint")}
      </span>
    </span>
  );
}

function snapshot(nodes: DraftNode[], edges: NoteDiagramEdge[]): string {
  return JSON.stringify({
    nodes: nodes.map((node) => ({ id: node.id, label: node.label.trim(), column: node.column.trim(), x: node.x, y: node.y, w: node.w, h: node.h, shape: node.shape, color: node.color })),
    edges,
  });
}

/**
 * Editable workflow inside the note document. The photo, when attached, is the background.
 * Changes stay local until the user saves.
 */
export default function NoteDiagramEditor({ noteId, diagram, readOnly = false, refreshKey = 0, onSaved, blockId, apply }: NoteDiagramEditorProps) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [nodes, setNodes] = useState<DraftNode[]>(() => layoutNodes(diagram));
  const [edges, setEdges] = useState<NoteDiagramEdge[]>(diagram.edges);
  const [savedMark, setSavedMark] = useState(() => snapshot(layoutNodes(diagram), diagram.edges));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelEditId, setLabelEditId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canvasHeight, setCanvasHeight] = useState(CANVAS_DEFAULT);
  const [tool, setTool] = useState<{ shape: DiagramShape; color: DiagramColor }>({ shape: "rect", color: "emerald" });
  const [applyOpen, setApplyOpen] = useState(false);
  const [editing, setEditing] = useState(() => diagram.nodes.length === 0);
  const heightDrag = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    const nextNodes = layoutNodes(diagram);
    const nextEdges = diagram.edges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSavedMark(snapshot(nextNodes, nextEdges));
    setSelectedId(null);
    setLabelEditId(null);
    setEditing(nextNodes.length === 0);
    // Local edits must survive parent re-renders. Reload replaces `updatedAt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, diagram.updatedAt]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageUrl(null);
    getNoteAttachments(noteId)
      .then((data) => {
        const image = [...data.noteAttachments].reverse().find((item) => item.mimeType.startsWith("image/"));
        if (!image || cancelled) return null;
        return fetch(getNoteAttachmentDownloadUrl(noteId, image.id), { credentials: "include" })
          .then((res) => (res.ok ? res.blob() : null));
      })
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [noteId, refreshKey, diagram.updatedAt]);

  const dirty = useMemo(() => snapshot(nodes, edges) !== savedMark, [nodes, edges, savedMark]);
  const selected = nodes.find((node) => node.id === selectedId) ?? null;

  const save = async () => {
    const payloadNodes = nodes.filter((node) => node.label.trim());
    if (payloadNodes.length === 0) return;
    setBusy(true);
    try {
      const saved = {
        nodes: payloadNodes.map((node) => ({
          id: node.id,
          label: node.label.trim(),
          ...(node.column.trim() ? { column: node.column.trim() } : {}),
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h,
          shape: node.shape,
          color: node.color,
        })),
        edges: edges.filter((edge) => payloadNodes.some((node) => node.id === edge.from) && payloadNodes.some((node) => node.id === edge.to)),
      };
      await saveNoteDiagram(noteId, saved, blockId);
      setSavedMark(snapshot(nodes, edges));
      setEditing(false);
      toast.success(t("notes.diagram.kept"));
      onSaved?.(saved);
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.fallback.generic", locale));
    } finally {
      setBusy(false);
    }
  };

  const stretch = (next: number) => setCanvasHeight(Math.max(CANVAS_MIN, Math.min(CANVAS_MAX, next)));

  return (
    <div className="mb-4 space-y-2">
      <div className="relative z-20 flex items-center justify-end gap-2">
        {!blockId && (
          <div className="mr-auto flex items-center gap-1">
            <p className="text-[11px] font-medium text-zinc-500 dark:text-slate-400">{t("notes.blocks.diagram")}</p>
            {!readOnly && <DiagramCanvasHelp />}
          </div>
        )}
        {!readOnly && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:border-slate-600 dark:text-slate-100"
          >
            {t("notes.diagram.edit")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setCanvasHeight((current) => (current >= 900 ? CANVAS_DEFAULT : 960))}
          className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
        >
          {canvasHeight >= 900 ? t("notes.diagram.shrink") : t("notes.diagram.expand")}
        </button>
      </div>
      {busy && <HourglassStatus label={t("notes.diagram.canvasSaving")} />}
      <div className="overflow-hidden rounded-md border border-zinc-200 dark:border-slate-700">
      <DiagramCanvas
        imageUrl={imageUrl}
        editable={!readOnly && editing}
        height={canvasHeight}
        drawShape={selected?.shape ?? tool.shape}
        drawColor={selected?.color ?? tool.color}
        resizeLabel={t("notes.diagram.resizeZone")}
        nodes={nodes.map((node) => ({ ...node, selected: node.id === selectedId }))}
        edges={edges}
        onCreate={(box) => {
          if (readOnly || nodes.length >= 25) return;
          const id = `n${Date.now()}`;
          setNodes((current) => [...current, { id, label: "", column: "", shape: tool.shape, color: tool.color, ...box }]);
          setSelectedId(id);
          setLabelEditId(id);
        }}
        onMove={(id, x, y) => setNodes((current) => current.map((node) => node.id === id ? { ...node, x, y } : node))}
        onResize={(id, x, y, w, h) => setNodes((current) => current.map((node) => node.id === id ? { ...node, x, y, w, h } : node))}
        onLink={(from, to) => setEdges((current) => current.some((edge) => edge.from === from && edge.to === to) ? current : [...current, { from, to }])}
        onUnlink={(from, to) => setEdges((current) => current.filter((edge) => edge.from !== from || edge.to !== to))}
        onLabel={(id, label) => setNodes((current) => current.map((node) => node.id === id ? { ...node, label } : node))}
        onDelete={(id) => {
          setNodes((current) => current.filter((node) => node.id !== id));
          setEdges((current) => current.filter((edge) => edge.from !== id && edge.to !== id));
          setSelectedId((current) => current === id ? null : current);
        }}
        labelEditId={labelEditId}
        labelPlaceholder={t("notes.diagram.editLabel")}
        removeLabel={t("notes.diagram.removeZone")}
        linkLabel={t("notes.diagram.linkHandle")}
        unlinkLabel={t("notes.diagram.removeLink")}
        onSelect={setSelectedId}
      />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={CANVAS_MIN}
        aria-valuemax={CANVAS_MAX}
        aria-valuenow={canvasHeight}
        aria-label={t("notes.diagram.resize")}
        tabIndex={0}
        className="flex h-4 cursor-ns-resize items-center justify-center"
        onPointerDown={(event) => {
          heightDrag.current = { y: event.clientY, h: canvasHeight };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = heightDrag.current;
          if (!current) return;
          stretch(current.h + (event.clientY - current.y));
        }}
        onPointerUp={() => { heightDrag.current = null; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") stretch(canvasHeight + 40);
          if (event.key === "ArrowUp") stretch(canvasHeight - 40);
        }}
      >
        <span className="h-1 w-12 rounded-full bg-zinc-300 dark:bg-slate-600" />
      </div>
      {!readOnly && editing && (
        <div className="space-y-2">
          <DiagramStyleBar
            shape={selected?.shape ?? tool.shape}
            color={selected?.color ?? tool.color}
            onShape={(shape) => {
              setTool((current) => ({ ...current, shape }));
              if (!selected) return;
              setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, shape } : node));
            }}
            onColor={(color) => {
              setTool((current) => ({ ...current, color }));
              if (!selected) return;
              setNodes((current) => current.map((node) => node.id === selected.id ? { ...node, color } : node));
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !dirty || nodes.every((node) => !node.label.trim())}
              onClick={() => { void save(); }}
              className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {busy ? t("notes.diagram.canvasSaving") : t("notes.diagram.canvasSave")}
            </button>
            {apply && (
              <button
                type="button"
                disabled={busy || nodes.every((node) => !node.label.trim())}
                onClick={() => setApplyOpen(true)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5"
              >
                {t("notes.diagram.apply")}
              </button>
            )}
          </div>
        </div>
      )}
      {apply && (
        <ApplyDiagramDialog
          open={applyOpen}
          noteId={noteId}
          nodes={nodes.filter((node) => node.label.trim()).map((node) => ({ id: node.id, label: node.label, column: node.column }))}
          edges={edges}
          projects={apply.projects}
          defaultProjectId={apply.defaultProjectId}
          parentId={apply.parentId}
          onClose={() => setApplyOpen(false)}
          onCreated={apply.onCreated}
        />
      )}
    </div>
  );
}
