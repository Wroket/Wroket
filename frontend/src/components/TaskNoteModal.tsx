"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useModalCloseKeys } from "@/lib/useModalCloseKeys";
import { useToast } from "@/components/Toast";
import NoteAttachmentsPanel from "@/components/NoteAttachmentsPanel";
import NoteToolbar from "@/components/NoteToolbar";
import DiagramImportDialog from "@/components/notes/DiagramImportDialog";
import NoteDocument from "@/components/notes/NoteDocument";
import SpawnTasksDialog from "@/components/notes/SpawnTasksDialog";
import NoteOcrDialog from "@/components/ocr/NoteOcrDialog";
import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";
import { useAuth } from "@/components/AuthContext";
import { getProjects, updateNoteApi, type Note, type Project, type Todo } from "@/lib/api";
import { getDiagramConfig, getOcrConfig, uploadNoteAttachment, type DiagramConfig, type NoteBlock, type OcrConfig } from "@/lib/api/notes";
import { appendCapture, resolveNoteBlocks, textHtmlFromBlocks } from "@/lib/noteBlocks";
import { parseNoteTaskLines } from "@/lib/noteTaskLines";
import { ocrTextToHtml } from "@/lib/ocrText";

export interface TaskNoteModalProps {
  note: Note | null;
  /** Display title of the linked task (optional). */
  taskTitle?: string;
  /** Meeting tasks turn confirmed lines into subtasks. */
  linkedTodo?: Pick<Todo, "id" | "projectId" | "phaseId" | "scheduledSlot"> | null;
  onClose: () => void;
  onNoteUpdated?: (note: Note) => void;
}

/**
 * In-context note editor opened from a task (create / open note)
 * without navigating away to `/notes`.
 */
export default function TaskNoteModal({
  note,
  taskTitle,
  linkedTodo,
  onClose,
  onNoteUpdated,
}: TaskNoteModalProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const trapRef = useFocusTrap(!!note);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ title?: string; content?: string; blocks?: NoteBlock[] }>({});
  const noteIdRef = useRef<string | null>(null);
  const blocksRef = useRef<NoteBlock[]>([]);
  const focusedTextId = useRef<string | null>(null);

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [ocrConfig, setOcrConfig] = useState<OcrConfig | null>(null);
  const [diagramConfig, setDiagramConfig] = useState<DiagramConfig | null>(null);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const narrow = useNarrowVisualViewport(!!note);

  noteIdRef.current = note?.id ?? null;

  useEffect(() => {
    if (!note) return;
    getOcrConfig().then(setOcrConfig).catch(() => setOcrConfig(null));
    getDiagramConfig().then(setDiagramConfig).catch(() => setDiagramConfig({ enabled: false, dailyLimit: 0, remaining: 0 }));
    getProjects().then((rows) => setProjects(rows.filter((item) => item.status === "active"))).catch(() => {});
  }, [note]);

  useEffect(() => {
    if (!note) return;
    const next = resolveNoteBlocks(note);
    blocksRef.current = next;
    setBlocks(next);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keep local edits if the parent note refreshes

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const id = noteIdRef.current;
    const pending = pendingRef.current;
    if (!id || (pending.title === undefined && pending.content === undefined && pending.blocks === undefined)) return;
    const payload = { ...pending };
    pendingRef.current = {};
    setSaving(true);
    try {
      const updated = await updateNoteApi(id, payload);
      setDirty(false);
      onNoteUpdated?.(updated);
    } catch {
      toast.error(t("toast.genericError"));
    } finally {
      setSaving(false);
    }
  }, [onNoteUpdated, t, toast]);

  const scheduleSave = useCallback(
    (patch: { title?: string; content?: string; blocks?: NoteBlock[] }) => {
      pendingRef.current = { ...pendingRef.current, ...patch };
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushSave();
      }, 450);
    },
    [flushSave],
  );

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    pendingRef.current = {};
    setDirty(false);
    // Sync contenteditable after mount / note change
    requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when switching note

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const handleClose = useCallback(async () => {
    await flushSave();
    onClose();
  }, [flushSave, onClose]);

  useModalCloseKeys(!!note, handleClose);

  if (!note) return null;

  const isOwner = !note.userId || note.userId === user?.uid;
  const panelClass = sheetPanelClass(
    narrow,
    "relative w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-sm border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl ui-v2-fade",
  );

  return (
    <ViewportOverlay open onClose={() => { void handleClose(); }} zClassName="z-[100]">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-note-modal-title"
        className={panelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start gap-3 px-4 sm:px-5 py-3 border-b border-zinc-100 dark:border-slate-800">
          <div className="flex-1 min-w-0 space-y-1">
            <input
              ref={titleRef}
              id="task-note-modal-title"
              value={title}
              disabled={!isOwner}
              onChange={(e) => {
                const next = e.target.value;
                setTitle(next);
                scheduleSave({ title: next });
              }}
              className="w-full bg-transparent text-base font-semibold text-zinc-900 dark:text-slate-100 outline-none placeholder:text-zinc-400"
              placeholder={t("notes.contentPlaceholder")}
            />
            {taskTitle && (
              <p className="text-[11px] text-zinc-500 dark:text-slate-400 truncate">
                {t("notes.modalLinkedTask").replace("{{title}}", taskTitle)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-zinc-400 dark:text-slate-500 min-w-[4.5rem] text-right">
              {saving ? t("notes.modalSaving") : dirty ? "…" : t("notes.saved")}
            </span>
            <Link
              href={`/notes?id=${encodeURIComponent(note.id)}`}
              className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              onClick={() => { void flushSave(); }}
            >
              {t("notes.openInNotesPage")}
            </Link>
            <button
              type="button"
              onClick={() => { void handleClose(); }}
              className="rounded-md p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={t("a11y.close")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {isOwner && (
          <NoteToolbar
            editorRef={contentRef}
            onOcr={ocrConfig?.enabled && diagramConfig?.enabled === false ? () => setOcrOpen(true) : undefined}
            onSpawnTasks={() => setSpawnOpen(true)}
            onDiagram={diagramConfig?.enabled ? () => setDiagramOpen(true) : undefined}
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4">
          <NoteDocument
            key={note.id}
            noteId={note.id}
            blocks={blocks}
            readOnly={!isOwner}
            editorRef={contentRef}
            onFocusText={(blockId) => { focusedTextId.current = blockId; }}
            diagramApply={{
              projects,
              defaultProjectId: linkedTodo?.projectId ?? note.projectId,
              parentId: linkedTodo?.scheduledSlot?.meetingUrl ? linkedTodo.id : null,
            }}
            onCommit={(next) => {
              blocksRef.current = next;
              setBlocks(next);
              scheduleSave({ blocks: next, content: textHtmlFromBlocks(next) });
            }}
          />
          <NoteAttachmentsPanel
            noteId={note.id}
            todoId={note.todoId}
            isOwner={isOwner}
          />
        </div>
      </div>
      {note && isOwner && ocrConfig?.enabled && (
        <NoteOcrDialog
          open={ocrOpen}
          noteId={note.id}
          canAttach={isOwner}
          remaining={ocrConfig.remaining}
          onClose={() => setOcrOpen(false)}
          onInsert={(text) => {
            const html = ocrTextToHtml(text);
            const editor = contentRef.current;
            if (!editor || !html) return;
            editor.focus();
            editor.insertAdjacentHTML("beforeend", html);
            const textId = focusedTextId.current ?? blocksRef.current.find((block) => block.type === "text")?.id;
            if (!textId) return;
            const next = blocksRef.current.map((block) => (
              block.type === "text" && block.id === textId ? { ...block, html: editor.innerHTML } : block
            ));
            blocksRef.current = next;
            setBlocks(next);
            scheduleSave({ blocks: next, content: textHtmlFromBlocks(next) });
          }}
          onAttachImage={async (file) => { await uploadNoteAttachment(note.id, file); }}
        />
      )}
      {note && isOwner && (
        <SpawnTasksDialog
          open={spawnOpen}
          noteId={note.id}
          lines={parseNoteTaskLines(textHtmlFromBlocks(blocks) || note.content || "")}
          sourceHtml={textHtmlFromBlocks(blocks) || note.content || ""}
          projects={projects}
          defaultProjectId={linkedTodo?.projectId ?? note.projectId}
          parentId={linkedTodo?.scheduledSlot?.meetingUrl ? linkedTodo.id : null}
          onClose={() => setSpawnOpen(false)}
        />
      )}
      {note && isOwner && (
        <DiagramImportDialog
          open={diagramOpen}
          noteId={note.id}
          projects={projects}
          defaultProjectId={linkedTodo?.projectId ?? note.projectId}
          parentId={linkedTodo?.scheduledSlot?.meetingUrl ? linkedTodo.id : null}
          canAttach={isOwner}
          replacesDiagram={blocks.some((block) => block.type === "diagram" && block.nodes.length > 0)}
          onClose={() => {
            setDiagramOpen(false);
            getDiagramConfig().then(setDiagramConfig).catch(() => {});
          }}
          onUseOcr={() => { setDiagramOpen(false); setOcrOpen(true); }}
          onAttachImage={async (file) => { await uploadNoteAttachment(note.id, file); }}
          onImport={({ nodes, edges, text }) => {
            const html = text.trim() ? ocrTextToHtml(text) : "";
            const next = appendCapture(blocksRef.current, nodes, edges, html);
            blocksRef.current = next;
            setBlocks(next);
            scheduleSave({ blocks: next, content: textHtmlFromBlocks(next) });
            toast.success(t("notes.diagram.kept"));
          }}
        />
      )}
    </ViewportOverlay>
  );
}
