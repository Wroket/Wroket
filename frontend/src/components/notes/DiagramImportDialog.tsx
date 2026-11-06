"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import ImageSourceMenu from "@/components/ocr/ImageSourceMenu";
import DiagramCanvas from "@/components/notes/DiagramCanvas";
import DiagramStyleBar from "@/components/notes/DiagramStyleBar";
import { diagramColor, diagramShape, type DiagramColor, type DiagramShape } from "@/components/notes/diagramStyle";
import { HourglassStatus } from "@/components/notes/HourglassStatus";
import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import { useLocale } from "@/lib/LocaleContext";
import { ApiClientError, formatUserFacingError } from "@/lib/apiErrors";
import {
  getDiagramConfig,
  listSpawnedTasks,
  ocrNoteImage,
  recognizeNoteDiagram,
  saveNoteDiagram,
  spawnTasksFromNote,
  type DiagramConfig,
  type Note,
  type NoteDiagramEdge,
  type NoteDiagramNode,
  type OcrSource,
  type SpawnTasksResult,
} from "@/lib/api/notes";
import type { Project } from "@/lib/api/projects";
import { CloudPickerError, type PickedImage } from "@/lib/cloudPickers/common";
import { isDropboxChooserConfigured, pickImageFromDropbox, preloadDropboxChooser } from "@/lib/cloudPickers/dropboxChooser";
import { isGoogleDrivePickerConfigured, pickImageFromGoogleDrive, preloadGoogleDrivePicker } from "@/lib/cloudPickers/googleDrivePicker";
import { proseFromCapture } from "@/lib/digitizeText";
import { ImageImportError, normalizeImageForOcr } from "@/lib/imageNormalize";
import { autocorrectOcrText } from "@/lib/ocrAutocorrect";

const LANGUAGE_HINTS = ["fr", "en", "es", "de", "it", "pt", "nl", "pl", "ru", "uk", "tr", "ar", "he", "hi", "zh", "ja", "ko"];

interface DraftNode {
  id: string;
  label: string;
  column: string;
  included: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  shape?: DiagramShape;
  color?: DiagramColor;
}

function placeNodes(items: DraftNode[]): DraftNode[] {
  const count = Math.max(items.length, 1);
  return items.map((node, index) => {
    if (typeof node.x === "number" && typeof node.y === "number" && typeof node.w === "number" && typeof node.h === "number") {
      return node;
    }
    const w = Math.min(0.26, 0.78 / count);
    const gap = (1 - w * count) / (count + 1);
    return { ...node, x: gap + index * (w + gap), y: 0.36, w, h: 0.22 };
  });
}

interface DiagramImportDialogProps {
  open: boolean;
  noteId: string;
  projects: Project[];
  defaultProjectId?: string | null;
  parentId?: string | null;
  canAttach: boolean;
  onClose: () => void;
  onUseOcr: () => void;
  onAttachImage?: (file: File) => Promise<void>;
  onNoteDiagramSaved?: (note?: Note | null) => void;
  onTasksCreated?: () => void;
  /** Prose from the photo. Called only when the user imports. */
  onInsertAside?: (text: string) => Promise<void> | void;
  /** One write: add the diagram and the prose. Skips the separate save and aside calls. */
  onImport?: (result: { nodes: NoteDiagramNode[]; edges: NoteDiagramEdge[]; text: string }) => Promise<void> | void;
  /** The note already has a diagram. Import adds another one. */
  replacesDiagram?: boolean;
}

/**
 * One photo → editable text and, when boxes are found, an editable diagram.
 * Nothing is stored until the user imports. When the diagram flag is off, the
 * dialog says so and offers text OCR instead.
 */
export default function DiagramImportDialog({
  open,
  noteId,
  projects,
  defaultProjectId,
  parentId,
  canAttach,
  onClose,
  onUseOcr,
  onAttachImage,
  onNoteDiagramSaved,
  onTasksCreated,
  onInsertAside,
  onImport,
  replacesDiagram = false,
}: DiagramImportDialogProps) {
  const { t, locale } = useLocale();
  const titleId = useId();
  const narrow = useNarrowVisualViewport(open);
  const [config, setConfig] = useState<DiagramConfig | null>(null);
  const [activity, setActivity] = useState<null | "read" | "save" | "tasks">(null);
  const busy = activity !== null;
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [nodes, setNodes] = useState<DraftNode[]>([]);
  const [edges, setEdges] = useState<NoteDiagramEdge[]>([]);
  const [labelEditId, setLabelEditId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [phaseId, setPhaseId] = useState("");
  const [createPhases, setCreatePhases] = useState(false);
  const [attachImage, setAttachImage] = useState(false);
  const [result, setResult] = useState<SpawnTasksResult | null>(null);
  const [externalPicker, setExternalPicker] = useState(false);
  const [readMode, setReadMode] = useState<"idle" | "mock" | "model">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aside, setAside] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [drawAnyway, setDrawAnyway] = useState(false);
  const [tool, setTool] = useState<{ shape: DiagramShape; color: DiagramColor }>({ shape: "rect", color: "emerald" });
  const [languageHint, setLanguageHint] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      const stored = sessionStorage.getItem("wroket-ocr-lang");
      if (stored !== null) return stored;
    } catch {
      /* ignore */
    }
    return locale === "fr" || locale === "en" ? locale : "";
  });

  const recognizedText = useRef("");
  const driveEnabled = useMemo(() => isGoogleDrivePickerConfigured(), []);
  const dropboxEnabled = useMemo(() => isDropboxChooserConfigured(), []);
  const project = projects.find((item) => item.id === projectId);
  const columns = [...new Set(nodes.map((node) => node.column.trim()).filter(Boolean))];

  const describe = useCallback((err: unknown, fallback: "errors.code.DIAGRAM_PROVIDER_ERROR" | "errors.code.OCR_PROVIDER_ERROR" = "errors.code.DIAGRAM_PROVIDER_ERROR"): string => {
    if (err instanceof ImageImportError || err instanceof CloudPickerError) return t(`notes.ocr.err.${err.code}`);
    return formatUserFacingError(err, fallback, locale);
  }, [locale, t]);

  const languageName = useCallback((code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNodes([]);
    setEdges([]);
    setBlob(null);
    setPreviewUrl(null);
    setResult(null);
    setAttachImage(false);
    setActivity(null);
    setReadMode("idle");
    setSelectedId(null);
    setLabelEditId(null);
    setAside("");
    setNotice(null);
    setDrawAnyway(false);
    setTool({ shape: "rect", color: "emerald" });
    setCreatePhases(false);
    setProjectId(defaultProjectId ?? "");
    setPhaseId("");
    getDiagramConfig().then(setConfig).catch(() => setConfig({ enabled: false, dailyLimit: 0, remaining: 0 }));
    if (driveEnabled) preloadGoogleDrivePicker().catch(() => {});
    if (dropboxEnabled) preloadDropboxChooser().catch(() => {});
  }, [open, defaultProjectId, driveEnabled, dropboxEnabled]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const analyze = useCallback(async (file: Blob, source: OcrSource) => {
    setActivity("read");
    setError(null);
    setNotice(null);
    const [diagramSettled, ocrSettled, spawnedSettled] = await Promise.allSettled([
      recognizeNoteDiagram(noteId, file),
      ocrNoteImage(noteId, file, { languageHint: languageHint || undefined, source }),
      listSpawnedTasks(noteId),
    ]);
    const spawned = spawnedSettled.status === "fulfilled" ? spawnedSettled.value : [];
    const existing = new Set(spawned.map((todo) => todo.originNodeId).filter(Boolean));
    let labels: string[] = [];
    let asideText = "";
    let diagramFailed = false;
    if (diagramSettled.status === "fulfilled" && diagramSettled.value.provider !== "mock") {
      setReadMode("model");
      const placed = placeNodes(diagramSettled.value.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        column: node.column ?? "",
        included: !existing.has(node.id),
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
        shape: diagramShape(node.shape),
        color: diagramColor(node.color),
      })));
      setNodes(placed);
      setEdges(diagramSettled.value.edges);
      labels = placed.map((node) => node.label);
      asideText = diagramSettled.value.aside ?? "";
    } else if (diagramSettled.status === "fulfilled") {
      setReadMode("mock");
      setNodes([]);
      setEdges([]);
    } else {
      diagramFailed = true;
      setReadMode("model");
      setNodes([]);
      setEdges([]);
    }

    let ocrText = "";
    let ocrFailed = false;
    if (ocrSettled.status === "fulfilled") {
      const lang = languageHint || ocrSettled.value.detectedLanguages?.[0]?.code || locale;
      ocrText = autocorrectOcrText(ocrSettled.value.text, lang);
    } else if (!(ocrSettled.reason instanceof ApiClientError && ocrSettled.reason.code === "OCR_DISABLED")) {
      ocrFailed = true;
    }
    recognizedText.current = ocrText;
    setAside(proseFromCapture(ocrText, asideText, labels));
    setResult(null);
    if (diagramFailed && ocrFailed) setError(describe(diagramSettled.status === "rejected" ? diagramSettled.reason : ocrSettled.status === "rejected" ? ocrSettled.reason : new Error("read")));
    else if (diagramFailed && diagramSettled.status === "rejected") setNotice(describe(diagramSettled.reason));
    else if (ocrFailed && ocrSettled.status === "rejected") setNotice(describe(ocrSettled.reason, "errors.code.OCR_PROVIDER_ERROR"));
    getDiagramConfig().then(setConfig).catch(() => {});
    setActivity(null);
  }, [describe, languageHint, locale, noteId]);

  const retryDiagram = useCallback(async () => {
    if (!blob) return;
    setActivity("read");
    setError(null);
    setNotice(null);
    try {
      const [proposal, spawned] = await Promise.all([
        recognizeNoteDiagram(noteId, blob),
        listSpawnedTasks(noteId).catch(() => []),
      ]);
      const existing = new Set(spawned.map((todo) => todo.originNodeId).filter(Boolean));
      if (proposal.provider === "mock") {
        setReadMode("mock");
        setNodes([]);
        setEdges([]);
      } else {
        setReadMode("model");
        const placed = placeNodes(proposal.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          column: node.column ?? "",
          included: !existing.has(node.id),
          x: node.x,
          y: node.y,
          w: node.w,
          h: node.h,
          shape: diagramShape(node.shape),
          color: diagramColor(node.color),
        })));
        setNodes(placed);
        setEdges(proposal.edges);
        setAside(proseFromCapture(recognizedText.current, proposal.aside ?? "", placed.map((node) => node.label)));
      }
      getDiagramConfig().then(setConfig).catch(() => {});
    } catch (err) {
      setNotice(describe(err));
    } finally {
      setActivity(null);
    }
  }, [blob, describe, noteId]);

  const acceptFile = useCallback(async (file: Blob, name: string, source: OcrSource) => {
    setActivity("read");
    setError(null);
    setNotice(null);
    try {
      const normalized = await normalizeImageForOcr(file, name, { crop: false, faithful: true });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(normalized);
      setPreviewUrl(URL.createObjectURL(normalized));
      setDrawAnyway(false);
      await analyze(normalized, source);
    } catch (err) {
      setError(describe(err));
      setActivity(null);
    }
  }, [analyze, describe, previewUrl]);

  const onFile = (file: File, source: OcrSource) => { void acceptFile(file, file.name, source); };

  const pickCloud = async (provider: "gdrive" | "dropbox") => {
    if (provider === "gdrive") setExternalPicker(true);
    try {
      const picked: PickedImage | null = provider === "gdrive"
        ? await pickImageFromGoogleDrive(locale)
        : await pickImageFromDropbox();
      setExternalPicker(false);
      if (picked) await acceptFile(picked.blob, picked.name, provider);
    } catch (err) {
      setExternalPicker(false);
      setError(describe(err));
    }
  };

  const graphPayload = () => ({
    nodes: nodes.filter((node) => node.label.trim()).map((node) => ({
      id: node.id,
      label: node.label.trim(),
      ...(node.column.trim() ? { column: node.column.trim() } : {}),
      ...(typeof node.x === "number" && typeof node.y === "number" && typeof node.w === "number" && typeof node.h === "number"
        ? { x: node.x, y: node.y, w: node.w, h: node.h }
        : {}),
      ...(node.shape ? { shape: node.shape } : {}),
      ...(node.color ? { color: node.color } : {}),
    })),
    edges: edges.filter((edge) => nodes.some((node) => node.id === edge.from && node.label.trim()) && nodes.some((node) => node.id === edge.to && node.label.trim())),
  });

  const keep = async () => {
    const payload = graphPayload();
    const extra = aside.trim();
    if (payload.nodes.length === 0 && !extra) return;
    setActivity("save");
    setError(null);
    try {
      if (onImport) {
        await onImport({ nodes: payload.nodes, edges: payload.edges, text: extra });
      } else {
        const saved = payload.nodes.length > 0 ? await saveNoteDiagram(noteId, payload) : null;
        if (extra) await onInsertAside?.(extra);
        onNoteDiagramSaved?.(saved);
      }
      if (attachImage && blob && onAttachImage) {
        await onAttachImage(new File([blob], "schema.jpg", { type: "image/jpeg" }));
      }
      onClose();
    } catch (err) {
      setError(describe(err));
    } finally {
      setActivity(null);
    }
  };

  const createTasks = async () => {
    const chosen = nodes.filter((node) => node.included && node.label.trim());
    if (chosen.length === 0) return;
    setActivity("tasks");
    setError(null);
    try {
      const chosenIds = new Set(chosen.map((node) => node.id));
      const created = await spawnTasksFromNote(noteId, {
        projectId: parentId ? null : projectId || null,
        phaseId: parentId ? null : phaseId || null,
        parentId: parentId || null,
        createPhases: createPhases && !parentId,
        items: chosen.map((node) => ({
          clientKey: node.id,
          title: node.label.trim(),
          column: node.column.trim() || null,
          priority: "medium",
        })),
        edges: edges.filter((edge) => chosenIds.has(edge.from) && chosenIds.has(edge.to)),
      });
      setResult(created);
      onTasksCreated?.();
    } catch (err) {
      setError(describe(err));
    } finally {
      setActivity(null);
    }
  };

  const activityLabel = activity === "read"
    ? t("notes.diagram.reading")
    : activity === "save"
      ? t("notes.diagram.canvasSaving")
      : activity === "tasks"
        ? t("notes.diagram.creating")
        : "";

  const enabled = config?.enabled === true;

  return (
    <ViewportOverlay open={open && !externalPicker} onClose={busy ? undefined : onClose} zClassName="z-[110]" backdropClassName="absolute inset-0 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={sheetPanelClass(narrow, "relative w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto")}
      >
        <h2 id={titleId} className="text-base font-semibold text-zinc-900 dark:text-slate-100">{t("notes.diagram.title")}</h2>
        {activity && <HourglassStatus label={activityLabel} />}
        {config === null ? (
          <HourglassStatus label={t("notes.diagram.reading")} />
        ) : !enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-slate-300">{t("notes.diagram.disabled")}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-slate-300">{t("notes.spawn.cancel")}</button>
              <button type="button" onClick={onUseOcr} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5">{t("notes.diagram.useOcr")}</button>
            </div>
          </div>
        ) : result ? (
          <div className="space-y-2 text-sm">
            <p>{t("notes.spawn.done")}</p>
            {result.dependencySkipped && <p className="text-xs text-amber-700 dark:text-amber-300">{t("notes.spawn.depsSkipped").replace("{code}", result.dependencySkipped)}</p>}
            {result.dependenciesApplied && <p className="text-xs text-emerald-700 dark:text-emerald-300">{t("notes.spawn.depsApplied")}</p>}
            <ul className="space-y-1">
              {result.created.map((item) => (
                <li key={item.id}>{item.title}{item.alreadyExisted ? ` · ${t("notes.spawn.existed")}` : ""}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-1.5">{t("notes.spawn.close")}</button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.diagram.privacy")}</p>
            {typeof config?.remaining === "number" && (
              <p className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.diagram.remaining").replace("{n}", String(config.remaining))}</p>
            )}
            <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-slate-400">
              <span className="shrink-0">{t("notes.ocr.language")}</span>
              <select
                value={languageHint}
                onChange={(event) => {
                  setLanguageHint(event.target.value);
                  try { sessionStorage.setItem("wroket-ocr-lang", event.target.value); } catch { /* ignore */ }
                }}
                className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100"
              >
                <option value="">{t("notes.ocr.languageAuto")}</option>
                {LANGUAGE_HINTS.map((code) => (
                  <option key={code} value={code}>{languageName(code)}</option>
                ))}
              </select>
            </label>
            <ImageSourceMenu
              disabled={busy}
              driveEnabled={driveEnabled}
              dropboxEnabled={dropboxEnabled}
              onFile={onFile}
              onPickDrive={() => { void pickCloud("gdrive"); }}
              onPickDropbox={() => { void pickCloud("dropbox"); }}
            />
            {previewUrl && (
              <div className="space-y-2">
                {notice && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-amber-700 dark:text-amber-300">{notice}</p>
                    {blob && (
                      <button type="button" disabled={busy} onClick={() => { void retryDiagram(); }} className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 dark:border-amber-800 dark:text-amber-200">
                        {t("notes.digitize.retry")}
                      </button>
                    )}
                  </div>
                )}
                {(readMode === "mock" || nodes.length > 0 || drawAnyway) && (
                  <p className="text-xs text-zinc-500 dark:text-slate-400">{t(readMode === "mock" ? "notes.diagram.drawHint" : "notes.diagram.moveHint")}</p>
                )}
                {(activity === "read" || readMode === "mock" || nodes.length > 0 || drawAnyway) && (
                <div className="relative">
                <DiagramCanvas
                  imageUrl={previewUrl}
                  drawShape={tool.shape}
                  drawColor={tool.color}
                  resizeLabel={t("notes.diagram.resizeZone")}
                  nodes={nodes.flatMap((node) => (
                    typeof node.x === "number" && typeof node.y === "number" && typeof node.w === "number" && typeof node.h === "number"
                      ? [{ id: node.id, label: node.label, x: node.x, y: node.y, w: node.w, h: node.h, shape: node.shape, color: node.color, selected: node.id === selectedId }]
                      : []
                  ))}
                  edges={edges}
                  onCreate={(box) => {
                    const id = `n${Date.now()}`;
                    setNodes((current) => [...current, { id, label: "", column: "", included: true, shape: tool.shape, color: tool.color, ...box }]);
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
                {activity === "read" && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-white/75 dark:bg-slate-900/75">
                    <HourglassStatus label={activityLabel} />
                  </div>
                )}
                </div>
                )}
                {readMode === "model" && nodes.length === 0 && !drawAnyway && activity !== "read" && (
                  <button type="button" onClick={() => setDrawAnyway(true)} className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm">
                    {t("notes.digitize.draw")}
                  </button>
                )}
                {(readMode === "mock" || nodes.length > 0 || drawAnyway) && (
                <DiagramStyleBar
                  shape={nodes.find((node) => node.id === selectedId)?.shape ?? tool.shape}
                  color={nodes.find((node) => node.id === selectedId)?.color ?? tool.color}
                  onShape={(shape) => {
                    setTool((current) => ({ ...current, shape }));
                    if (!selectedId) return;
                    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, shape } : node));
                  }}
                  onColor={(color) => {
                    setTool((current) => ({ ...current, color }));
                    if (!selectedId) return;
                    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, color } : node));
                  }}
                />
                )}
                {readMode !== "idle" && (
                  <>
                    <label className="block space-y-1 text-xs text-zinc-600 dark:text-slate-300">
                      {t("notes.diagram.aside")}
                      <textarea
                        value={aside}
                        onChange={(event) => setAside(event.target.value)}
                        rows={4}
                        className="mt-1 w-full rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100"
                      />
                    </label>
                    <p className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.diagram.asideHint")}</p>
                  </>
                )}
                {readMode !== "idle" && nodes.length === 0 && !aside.trim() && !busy && (
                  <p className="text-sm text-zinc-600 dark:text-slate-300">{t("notes.diagram.emptyGraph")}</p>
                )}
              </div>
            )}
            {!parentId && nodes.length > 0 && (
              <div className="flex flex-wrap gap-3 items-end">
                <label className="text-xs text-zinc-500 flex flex-col gap-1">
                  {t("notes.spawn.project")}
                  <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPhaseId(""); }} className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100">
                    <option value="">{t("notes.spawn.noProject")}</option>
                    {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                {(project?.phases.length ?? 0) > 0 && (
                  <label className="text-xs text-zinc-500 flex flex-col gap-1">
                    {t("notes.spawn.phase")}
                    <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-zinc-800 dark:text-slate-100">
                      <option value="">{t("notes.spawn.noPhase")}</option>
                      {project?.phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
                    </select>
                  </label>
                )}
                {columns.length > 0 && projectId && (
                  <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-slate-200">
                    <input type="checkbox" checked={createPhases} onChange={(e) => setCreatePhases(e.target.checked)} />
                    {t("notes.diagram.createPhases")}
                  </label>
                )}
              </div>
            )}
            {canAttach && (
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-slate-300">
                <input type="checkbox" checked={attachImage} onChange={(e) => setAttachImage(e.target.checked)} />
                {t("notes.diagram.attach")}
              </label>
            )}
            {replacesDiagram && nodes.some((node) => node.label.trim()) && (
              <p className="text-xs text-amber-700 dark:text-amber-300">{t("notes.digitize.replaceHint")}</p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-slate-300">{t("notes.spawn.cancel")}</button>
              <button type="button" disabled={busy || (nodes.every((node) => !node.label.trim()) && !aside.trim())} onClick={() => { void keep(); }} className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm">
                {replacesDiagram && nodes.some((node) => node.label.trim()) ? t("notes.digitize.replace") : t("notes.diagram.keep")}
              </button>
              <button type="button" disabled={busy || !nodes.some((node) => node.included && node.label.trim())} onClick={() => { void createTasks(); }} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-medium px-3 py-1.5">{t("notes.diagram.createTasks")}</button>
            </div>
          </>
        )}
      </div>
    </ViewportOverlay>
  );
}
