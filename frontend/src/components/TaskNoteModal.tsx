"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useModalCloseKeys } from "@/lib/useModalCloseKeys";
import { useToast } from "@/components/Toast";
import NoteAttachmentsPanel from "@/components/NoteAttachmentsPanel";
import NoteToolbar from "@/components/NoteToolbar";
import { useAuth } from "@/components/AuthContext";
import { updateNoteApi, type Note } from "@/lib/api";

export interface TaskNoteModalProps {
  note: Note | null;
  /** Display title of the linked task (optional). */
  taskTitle?: string;
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
  const pendingRef = useRef<{ title?: string; content?: string }>({});
  const noteIdRef = useRef<string | null>(null);

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  noteIdRef.current = note?.id ?? null;

  const flushSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const id = noteIdRef.current;
    const pending = pendingRef.current;
    if (!id || (pending.title === undefined && pending.content === undefined)) return;
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
    (patch: { title?: string; content?: string }) => {
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
      if (contentRef.current && contentRef.current.innerHTML !== (note.content || "")) {
        contentRef.current.innerHTML = note.content || "";
      }
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-6"
      onClick={() => { void handleClose(); }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-note-modal-title"
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-sm border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl ui-v2-fade"
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

        {isOwner && <NoteToolbar editorRef={contentRef} />}

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div
            ref={contentRef}
            contentEditable={isOwner}
            suppressContentEditableWarning
            onInput={() => {
              if (!contentRef.current) return;
              scheduleSave({ content: contentRef.current.innerHTML });
            }}
            data-placeholder={isOwner ? t("notes.contentPlaceholder") : ""}
            className={`min-h-[220px] px-4 sm:px-5 py-4 text-sm text-zinc-800 dark:text-slate-200 outline-none leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-400 dark:empty:before:text-slate-500 ${
              isOwner ? "" : "cursor-default"
            }`}
          />
          <NoteAttachmentsPanel
            noteId={note.id}
            todoId={note.todoId}
            isOwner={isOwner}
          />
        </div>
      </div>
    </div>
  );
}
