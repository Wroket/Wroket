"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { getComments, postCommentApi, deleteCommentApi } from "@/lib/api";
import type { Todo, Priority, Effort, AuthMeResponse, Comment } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

export interface TaskEditModalProps {
  todo: Todo | null;
  form: {
    title: string;
    priority: Priority;
    effort: Effort;
    deadline: string;
    assignedTo: string | null;
    estimatedMinutes: number | null;
    tags: string[];
  };
  onFormChange: (updates: Partial<TaskEditModalProps["form"]>) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  assignEmail: string;
  onAssignEmailChange: (email: string) => void;
  assignedUser: AuthMeResponse | null;
  assignError: string | null;
  onAssignLookup: () => void;
  onClearAssign: () => void;
  userDisplayName: (uid: string) => string;
  onOpenSubtasks?: (todo: Todo) => void;
  subtaskCount?: number;
  effortDefaults?: { light: number; medium: number; heavy: number };
  currentUserUid?: string;
}

export default function TaskEditModal({
  todo,
  form,
  onFormChange,
  onSave,
  onClose,
  saving,
  assignEmail,
  onAssignEmailChange,
  assignedUser,
  assignError,
  onAssignLookup,
  onClearAssign,
  userDisplayName,
  onOpenSubtasks,
  subtaskCount = 0,
  effortDefaults,
  currentUserUid,
}: TaskEditModalProps) {
  const { t } = useLocale();
  const [tagInput, setTagInput] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);

  const loadComments = useCallback(async (todoId: string) => {
    try {
      const c = await getComments(todoId);
      setComments(c);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!todo) return;
    loadComments(todo.id);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [todo, onClose, loadComments]);

  if (!todo) return null;

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || form.tags.includes(tag)) { setTagInput(""); return; }
    onFormChange({ tags: [...form.tags, tag] });
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    onFormChange({ tags: form.tags.filter((t2) => t2 !== tag) });
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !todo) return;
    setCommentLoading(true);
    try {
      const c = await postCommentApi(todo.id, commentText.trim());
      setComments((prev) => [...prev, c]);
      setCommentText("");
    } catch { /* ignore */ }
    setCommentLoading(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!todo) return;
    try {
      await deleteCommentApi(todo.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-edit-modal-title"
        className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-700 w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="task-edit-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-4"
        >
          {t("edit.title")}
        </h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("edit.titleField")}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => onFormChange({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onClose();
              }}
              autoFocus
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                {t("edit.priority")}
              </label>
              <select
                value={form.priority}
                onChange={(e) => onFormChange({ priority: e.target.value as Priority })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              >
                <option value="high">{t("priority.high")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="low">{t("priority.low")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                {t("edit.effort")}
              </label>
              <select
                value={form.effort}
                onChange={(e) => onFormChange({ effort: e.target.value as Effort })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              >
                <option value="light">{t("effort.light")}</option>
                <option value="medium">{t("effort.medium")}</option>
                <option value="heavy">{t("effort.heavy")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                {t("edit.deadline")}
              </label>
              <input
                type="date"
                value={form.deadline}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => onFormChange({ deadline: e.target.value })}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("todos.estimatedTime")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={480}
                step={5}
                value={form.estimatedMinutes ?? ""}
                placeholder={String(effortDefaults?.[form.effort] ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  onFormChange({ estimatedMinutes: v === "" ? null : Math.max(1, Math.min(480, Number(v) || 1)) });
                }}
                className="w-24 rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 text-center"
              />
              <span className="text-xs text-zinc-400 dark:text-slate-500">{t("todos.estimatedMinutes")}</span>
              {form.estimatedMinutes !== null && (
                <button
                  type="button"
                  onClick={() => onFormChange({ estimatedMinutes: null })}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t("todos.useDefault")}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
              {t("assign.label")}
            </label>
            <div className="relative">
              <input
                type="email"
                placeholder={t("assign.placeholder")}
                value={assignEmail}
                onChange={(e) => onAssignEmailChange(e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 ${
                  assignedUser
                    ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                    : assignError
                      ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                      : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
                }`}
              />
              {form.assignedTo && !assignEmail && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500 dark:text-slate-400">
                    {t("assign.label")}: {userDisplayName(form.assignedTo)}
                  </span>
                  <button
                    type="button"
                    onClick={onClearAssign}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              )}
              {assignedUser && (
                <span className="absolute right-2 top-2.5 text-green-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              )}
              {assignError && (
                <p className="text-[10px] text-red-500 mt-0.5">{assignError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700">
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1.5">
            {t("tags.label" as TranslationKey)}
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {tag}
                <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-500">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder={t("tags.add" as TranslationKey)}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
              className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <button type="button" onClick={handleAddTag} disabled={!tagInput.trim()} className="rounded bg-indigo-600 px-2 py-1 text-xs text-white disabled:opacity-40">+</button>
          </div>
        </div>

        {/* Comments */}
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700">
          <h4 className="text-xs font-medium text-zinc-500 dark:text-slate-400 mb-2">
            {t("comments.title" as TranslationKey)} ({comments.length})
          </h4>
          <div className="max-h-40 overflow-y-auto space-y-2 mb-2">
            {comments.length === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-slate-500 italic">{t("comments.empty" as TranslationKey)}</p>
            ) : comments.map((c) => (
              <div key={c.id} className="bg-zinc-50 dark:bg-slate-800/60 rounded px-3 py-2 text-xs group">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium text-zinc-700 dark:text-slate-300">{c.userEmail}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 dark:text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {currentUserUid === c.userId && (
                      <button type="button" onClick={() => handleDeleteComment(c.id)} className="text-zinc-300 dark:text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-zinc-600 dark:text-slate-400 whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder={t("comments.placeholder" as TranslationKey)}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handlePostComment(); } }}
              className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <button type="button" onClick={handlePostComment} disabled={commentLoading || !commentText.trim()} className="rounded bg-slate-700 dark:bg-slate-100 px-3 py-1 text-xs font-medium text-white dark:text-slate-900 disabled:opacity-40">
              {t("comments.send" as TranslationKey)}
            </button>
          </div>
        </div>

        {!todo.parentId && onOpenSubtasks && (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-zinc-700 dark:text-slate-300">
                {t("subtask.title")}
              </h4>
              <button
                type="button"
                onClick={() => onOpenSubtasks(todo)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("subtask.addShort")}
              </button>
            </div>
            {subtaskCount === 0 ? (
              <p className="text-xs text-zinc-400 dark:text-slate-500">
                {t("subtask.none")}
              </p>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-slate-400">
                {subtaskCount} {t("subtask.title").toLowerCase()}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center mt-5">
          {!todo.parentId && onOpenSubtasks && (
            <button
              type="button"
              onClick={() => onOpenSubtasks(todo)}
              className="flex items-center gap-1.5 rounded border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
              title={t("subtask.add")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("subtask.addShort")}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("edit.cancel")}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !form.title.trim()}
              className="rounded bg-slate-700 dark:bg-slate-100 px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 disabled:opacity-60 transition-colors"
            >
              {saving ? t("edit.saving") : t("edit.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
