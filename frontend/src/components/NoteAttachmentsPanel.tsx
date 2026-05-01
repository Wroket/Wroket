"use client";

import { useEffect, useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import {
  getNoteAttachments,
  uploadNoteAttachment,
  deleteNoteAttachment,
  getNoteAttachmentDownloadUrl,
  getTaskAttachmentViaNoteUrl,
  type NoteAttachment,
  type NoteAttachmentsResponse,
} from "@/lib/api/notes";

interface TaskAttachmentPreview {
  id: string;
  todoId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface NoteAttachmentsPanelProps {
  noteId: string;
  /** If the note is linked to a task, this todoId is set. */
  todoId?: string | null;
  /** Whether the current user owns the note (can upload / delete). */
  isOwner: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function FileIcon({ mime }: { mime: string }) {
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  return (
    <svg
      className="w-4 h-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      {isImage ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 4.5h18A.75.75 0 0121 5.25v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 18.75V5.25A.75.75 0 013.75 4.5z" />
      ) : isPdf ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
      )}
    </svg>
  );
}

export default function NoteAttachmentsPanel({ noteId, todoId, isOwner }: NoteAttachmentsPanelProps) {
  const { t } = useLocale();
  const [data, setData] = useState<NoteAttachmentsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setData(null);
    getNoteAttachments(noteId).then(setData).catch(() => setData({ noteAttachments: [], taskAttachments: [] }));
  }, [noteId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setError(null);
    setUploading(true);
    setUploadPct(0);
    try {
      await uploadNoteAttachment(noteId, file, setUploadPct);
      const fresh = await getNoteAttachments(noteId);
      setData(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notes.attachError"));
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const handleDelete = async (att: NoteAttachment) => {
    if (!window.confirm(t("notes.attachDeleteConfirm"))) return;
    try {
      await deleteNoteAttachment(noteId, att.id);
      setData((prev) =>
        prev ? { ...prev, noteAttachments: prev.noteAttachments.filter((a) => a.id !== att.id) } : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("notes.attachError"));
    }
  };

  const noteAtts: NoteAttachment[] = data?.noteAttachments ?? [];
  const taskAtts: TaskAttachmentPreview[] = (data?.taskAttachments ?? []).map((a) => ({
    ...a,
    todoId: todoId ?? "",
  }));

  const total = noteAtts.length + taskAtts.length;

  return (
    <div className="border-t border-zinc-200 dark:border-slate-700 px-4 py-3 bg-zinc-50/70 dark:bg-slate-900/70">
      <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-white dark:bg-slate-900 shadow-sm px-3 py-2.5">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-zinc-700 dark:text-slate-200 tracking-wide">
          {t("notes.attachments")} {total > 0 ? `(${total})` : ""}
        </span>
        {isOwner && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("notes.attachUpload")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip,.json"
            />
          </>
        )}
      </div>

      {uploading && (
        <div className="mb-2.5 rounded-md border border-zinc-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 p-2">
          <div className="h-1.5 bg-zinc-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all"
              style={{ width: `${uploadPct}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-slate-400 mt-1">{t("notes.attachUploading")} {uploadPct}%</p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-2 rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-2 py-1">{error}</p>
      )}

      {total === 0 && !uploading && (
        <p className="text-xs text-zinc-600 dark:text-slate-400 rounded-md border border-dashed border-zinc-300 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 px-2.5 py-2">
          {t("notes.attachNone")}
        </p>
      )}

      <ul className="space-y-1">
        {noteAtts.map((att) => (
          <li key={att.id} className="flex items-center gap-2 text-xs group">
            <span className="text-zinc-400 dark:text-slate-500"><FileIcon mime={att.mimeType} /></span>
            <a
              href={getNoteAttachmentDownloadUrl(noteId, att.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-zinc-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 underline-offset-2 hover:underline"
            >
              {att.originalName}
            </a>
            <span className="text-zinc-400 dark:text-slate-500 shrink-0">{formatBytes(att.size)}</span>
            {isOwner && (
              <button
                type="button"
                onClick={() => handleDelete(att)}
                className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all"
                title={t("notes.attachDelete")}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </li>
        ))}

        {taskAtts.map((att) => (
          <li key={att.id} className="flex items-center gap-2 text-xs group">
            <span className="text-zinc-400 dark:text-slate-500"><FileIcon mime={att.mimeType} /></span>
            <a
              href={getTaskAttachmentViaNoteUrl(noteId, att.todoId, att.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline-offset-2 hover:underline"
              title={t("notes.attachFromTask")}
            >
              {att.originalName}
            </a>
            <span className="text-[9px] font-medium text-indigo-400 dark:text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded shrink-0">
              {t("notes.attachTaskBadge")}
            </span>
            <span className="text-zinc-400 dark:text-slate-500 shrink-0">{formatBytes(att.size)}</span>
          </li>
        ))}
      </ul>
      </div>
    </div>
  );
}
