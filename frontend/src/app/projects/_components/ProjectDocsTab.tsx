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

  const createNote = async () => {
    setCreating(true);
    try {
      const note = await createNoteApi({
        title: defaultTitleSuggestion,
        content: "",
        projectId,
      });
      setNotes((prev) => [note, ...prev]);
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
        {canEdit && notes.length > 0 && (
          <button
            type="button"
            onClick={() => void createNote()}
            disabled={creating}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700"
          >
            {creating ? "…" : t("projects.docsAdd")}
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-10 px-4 text-center">
          <p className="text-sm text-zinc-500 dark:text-slate-400 mb-4">{t("projects.docsEmpty")}</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => void createNote()}
              disabled={creating}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 transition-colors"
            >
              {creating ? "…" : t("projects.docsAdd")}
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-slate-800 rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
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
    </div>
  );
}
