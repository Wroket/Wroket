"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { getArchivedNotes, purgeArchivedNoteApi, restoreArchivedNoteApi, type Note } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

export default function ArchivedNotesPanel() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await getArchivedNotes();
      setNotes(list);
    } catch {
      toast.error(t("toast.loadError"));
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRestore = async (id: string) => {
    try {
      await restoreArchivedNoteApi(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      toast.success(t("notes.restored"));
    } catch {
      toast.error(t("toast.restoreError"));
    }
  };

  const onPurge = async () => {
    if (!purgeId) return;
    const id = purgeId;
    setPurgeId(null);
    try {
      await purgeArchivedNoteApi(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const formatArchived = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-US" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("notes.archiveTitle")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("notes.archiveSubtitle")}</p>
        </div>
        <Link
          href="/notes"
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
        >
          ← {t("nav.notes")}
        </Link>
      </div>

      {notes.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-8 text-center">
          <p className="text-sm text-zinc-400 dark:text-slate-500">{t("notes.archiveEmpty")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-white dark:bg-slate-900 rounded-lg border border-zinc-200 dark:border-slate-700 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-slate-100 truncate">{n.title || t("notes.untitled")}</p>
                <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
                  {t("notes.archivedAt")}{" "}
                  {formatArchived(n.archivedAt ?? n.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void onRestore(n.id)}
                  className="rounded-lg border border-blue-500 dark:border-blue-400 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                >
                  {t("projects.restore")}
                </button>
                <button
                  type="button"
                  onClick={() => setPurgeId(n.id)}
                  className="rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  {t("notes.purge")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={purgeId !== null}
        title={t("notes.purge")}
        message={t("notes.purgeConfirm")}
        onConfirm={() => void onPurge()}
        onCancel={() => setPurgeId(null)}
        variant="danger"
      />
    </div>
  );
}
