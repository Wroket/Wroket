"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { confirmTaskImport, previewTaskImport, type TaskImportPreviewResult } from "@/lib/api";
import { useToast } from "./Toast";

interface Props {
  file: File | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TaskImportModal({ file, open, onClose, onSuccess }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<TaskImportPreviewResult | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      setPreview(null);
      setPreviewFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setPreviewFailed(false);
    previewTaskImport(file)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewFailed(true);
          toast.error(t("export.error"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, file, t, toast]);

  const handleConfirm = useCallback(async () => {
    if (!preview?.validTasks.length) {
      onClose();
      return;
    }
    setConfirming(true);
    try {
      const result = await confirmTaskImport(preview.validTasks);
      if (result.created > 0) {
        toast.success(t("import.tasksSuccess"));
        onSuccess();
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} ${t("import.errorsDuringConfirm")}`);
      }
      onClose();
    } catch {
      toast.error(t("export.error"));
    } finally {
      setConfirming(false);
    }
  }, [preview, toast, t, onClose, onSuccess]);

  if (!open || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-slate-100 px-4 py-3 border-b border-zinc-200 dark:border-slate-600">
          {t("import.tasksPreviewTitle")}
        </h3>
        <div className="p-4 overflow-y-auto text-sm text-zinc-700 dark:text-slate-300 space-y-3">
          <p className="text-xs text-zinc-500 dark:text-slate-400 break-all">{file.name}</p>
          {loading && <p>{t("import.previewLoading")}</p>}
          {!loading && previewFailed && <p className="text-red-600 dark:text-red-400">{t("export.error")}</p>}
          {!loading && preview && (
            <>
              <p>
                <span className="text-zinc-500 dark:text-slate-400">{t("import.previewValid")}: </span>
                <strong>{preview.validTasks.length}</strong>
                <span className="text-zinc-500 dark:text-slate-400"> — {t("import.previewTotal")}: </span>
                {preview.total}
              </p>
              {preview.errors.length > 0 && (
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                    {preview.errors.length} {t("import.previewRowErrorsShort")}
                  </p>
                  <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto font-mono text-red-600 dark:text-red-400">
                    {preview.errors.slice(0, 30).map((err: { row: number; message: string }, i: number) => (
                      <li key={i}>
                        {t("import.row")} {err.row}: {err.message}
                      </li>
                    ))}
                    {preview.errors.length > 30 && <li>…</li>}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-200 dark:border-slate-600">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
          >
            {t("import.cancel")}
          </button>
          <button
            type="button"
            disabled={loading || confirming || !preview?.validTasks.length}
            onClick={handleConfirm}
            className="px-3 py-1.5 text-xs rounded bg-slate-700 dark:bg-slate-600 text-white disabled:opacity-50"
          >
            {confirming ? "…" : t("import.confirmImport")}
          </button>
        </div>
      </div>
    </div>
  );
}
