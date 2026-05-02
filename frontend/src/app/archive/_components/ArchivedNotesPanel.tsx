"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { getArchivedNotes, purgeArchivedNoteApi, restoreArchivedNoteApi, type Note } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

type NoteBulkConfirm =
  | { kind: "restore"; notes: Note[] }
  | { kind: "purge"; notes: Note[] }
  | null;

export default function ArchivedNotesPanel() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [noteBulkConfirm, setNoteBulkConfirm] = useState<NoteBulkConfirm>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const visible = new Set(notes.map((n) => n.id));
    setSelectedIds((prev) => {
      let removed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else removed = true;
      }
      return removed ? next : prev;
    });
  }, [notes]);

  const selectedNotes = useMemo(
    () => notes.filter((n) => selectedIds.has(n.id)),
    [notes, selectedIds],
  );

  const selectedCount = selectedNotes.length;

  const allVisibleSelected = notes.length > 0 && selectedCount === notes.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = selectedCount > 0 && !allVisibleSelected;
  }, [selectedCount, allVisibleSelected]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (notes.length === 0) return prev;
      const allIds = notes.map((n) => n.id);
      const allOn = allIds.every((id) => prev.has(id));
      return allOn ? new Set() : new Set(allIds);
    });
  }, [notes]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

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

  const handleNoteBulkConfirm = () => {
    const c = noteBulkConfirm;
    setNoteBulkConfirm(null);
    if (!c) return;
    void (async () => {
      try {
        if (c.kind === "restore") {
          for (const n of c.notes) {
            await restoreArchivedNoteApi(n.id);
          }
          const ids = new Set(c.notes.map((n) => n.id));
          setNotes((prev) => prev.filter((n) => !ids.has(n.id)));
          toast.success(t("notes.restored"));
        } else {
          for (const n of c.notes) {
            await purgeArchivedNoteApi(n.id);
          }
          const ids = new Set(c.notes.map((n) => n.id));
          setNotes((prev) => prev.filter((n) => !ids.has(n.id)));
        }
        clearSelection();
      } catch {
        toast.error(c.kind === "restore" ? t("toast.restoreError") : t("toast.deleteError"));
      }
    })();
  };

  const handleBulkRestoreClick = () => {
    if (selectedNotes.length === 0) return;
    setNoteBulkConfirm({ kind: "restore", notes: selectedNotes });
  };

  const handleBulkPurgeClick = () => {
    if (selectedNotes.length === 0) return;
    setNoteBulkConfirm({ kind: "purge", notes: selectedNotes });
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
        <div className="space-y-3">
          {selectedCount > 0 && (
            <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/35 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 gap-y-2">
                <span className="text-xs font-medium text-emerald-900 dark:text-emerald-100 mr-1">
                  {t("bulk.selectedCount").replace("{{count}}", String(selectedCount))}
                </span>
                <button
                  type="button"
                  onClick={handleBulkRestoreClick}
                  className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-blue-200/80 dark:border-blue-800/60 text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                >
                  {t("projects.restore")}
                </button>
                <button
                  type="button"
                  onClick={handleBulkPurgeClick}
                  className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                >
                  {t("notes.purge")}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-xs font-medium px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:underline ml-auto"
                >
                  {t("bulk.clearSelection")}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pb-1">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-slate-400 cursor-pointer select-none">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => toggleSelectAll()}
                className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                aria-label={t("a11y.selectAllTasks")}
              />
              {t("a11y.selectAllTasks")}
            </label>
          </div>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-white dark:bg-slate-900 rounded-lg border border-zinc-200 dark:border-slate-700 px-4 py-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500 shrink-0 mt-1"
                    aria-label={t("a11y.selectTaskRow")}
                  />
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900 dark:text-slate-100 truncate">{n.title || t("notes.untitled")}</p>
                    <p className="text-[11px] text-zinc-400 dark:text-slate-500 mt-0.5">
                      {t("notes.archivedAt")}{" "}
                      {formatArchived(n.archivedAt ?? n.updatedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 sm:pl-0 pl-8">
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
        </div>
      )}

      <ConfirmDialog
        open={purgeId !== null}
        title={t("notes.purge")}
        message={t("notes.purgeConfirm")}
        onConfirm={() => void onPurge()}
        onCancel={() => setPurgeId(null)}
        variant="danger"
      />

      <ConfirmDialog
        open={noteBulkConfirm !== null}
        title={
          noteBulkConfirm == null
            ? ""
            : noteBulkConfirm.kind === "restore"
              ? t("archives.bulkRestoreNotesTitle").replace("{{count}}", String(noteBulkConfirm.notes.length))
              : t("archives.bulkPurgeNotesTitle").replace("{{count}}", String(noteBulkConfirm.notes.length))
        }
        message={
          noteBulkConfirm == null
            ? ""
            : noteBulkConfirm.kind === "restore"
              ? t("archives.bulkRestoreNotesMessage")
              : t("archives.bulkPurgeNotesMessage")
        }
        variant={noteBulkConfirm?.kind === "restore" ? "info" : "danger"}
        confirmLabel={
          noteBulkConfirm?.kind === "restore" ? t("projects.restore") : t("notes.purge")
        }
        onCancel={() => setNoteBulkConfirm(null)}
        onConfirm={handleNoteBulkConfirm}
      />
    </div>
  );
}
