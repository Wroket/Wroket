"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { getProjectNotesApi } from "@/lib/api/projects";
import { createNoteApi, type Note } from "@/lib/api/notes";

interface Props {
  projectId: string;
  projectName: string;
  canEdit: boolean;
}

export default function ProjectDocsTab({ projectId, projectName, canEdit }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getProjectNotesApi(projectId);
      setNotes(list);
    } catch {
      toast.error(t("projects.docsLoadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultTitleSuggestion = `${projectName} — ${t("projects.docsNewNote")}`;

  const openCreateModal = () => {
    setCreateTitle("");
    setCreateModalOpen(true);
  };

  const handleCreate = async () => {
    const title = createTitle.trim();
    if (!title) {
      toast.error(t("projects.docsCreateNameRequired"));
      return;
    }
    setCreating(true);
    try {
      const note = await createNoteApi({
        title,
        content: "",
        projectId,
      });
      setNotes((prev) => [note, ...prev]);
      setCreateModalOpen(false);
      setCreateTitle("");
      toast.success(t("projects.docsCreated"));
      router.push(`/notes?id=${encodeURIComponent(note.id)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("projects.docsCreateError"));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-600 dark:text-slate-400">{t("projects.docsHint")}</p>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            disabled={creating}
            className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {t("projects.docsAdd")}
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-slate-400 py-8 text-center">{t("projects.docsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-slate-800 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes?id=${encodeURIComponent(note.id)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{note.title}</span>
                <span className="text-xs text-zinc-500 dark:text-slate-400 shrink-0">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {createModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => !creating && setCreateModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-doc-create-title"
            className="w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="project-doc-create-title" className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              {t("projects.docsCreateTitle")}
            </h2>
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400" htmlFor="project-doc-name">
              {t("projects.docsCreateNameLabel")}
            </label>
            <input
              id="project-doc-name"
              type="text"
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value.slice(0, 200))}
              maxLength={200}
              placeholder={defaultTitleSuggestion}
              className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
                className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-sm text-zinc-700 dark:text-slate-300 disabled:opacity-50"
              >
                {t("projects.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !createTitle.trim()}
                className="rounded-lg bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {creating ? "…" : t("projects.docsCreateConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
