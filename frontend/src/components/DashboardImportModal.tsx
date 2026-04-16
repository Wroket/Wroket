"use client";

import { useCallback, useEffect, useRef, type ChangeEvent } from "react";
import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  downloadProjectImportTemplateCsv,
  downloadTaskImportTemplateCsv,
  downloadTaskImportTemplateJson,
} from "@/lib/importTemplates";

interface DashboardImportModalProps {
  open: boolean;
  onClose: () => void;
  onTasksFile: (file: File) => void;
  onImportProject: () => void;
}

export default function DashboardImportModal({
  open,
  onClose,
  onTasksFile,
  onImportProject,
}: DashboardImportModalProps) {
  const { t } = useLocale();
  const trapRef = useFocusTrap(open);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileRef.current) fileRef.current.value = "";
      if (!file) return;
      onClose();
      onTasksFile(file);
    },
    [onClose, onTasksFile],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.json,application/json,text/csv,text/plain"
        className="hidden"
        onChange={handleFileChange}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-import-title"
        className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-zinc-200 dark:border-slate-700 p-6"
      >
        <h2 id="dashboard-import-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
          {t("dashboard.importModalTitle")}
        </h2>
        <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("dashboard.importModalHint")}</p>
        <p className="text-xs text-zinc-500 dark:text-slate-500 mt-2">{t("import.templatesShortHint")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadTaskImportTemplateCsv()}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 rounded border border-zinc-200 dark:border-slate-600 px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("import.sampleTasksCsv")}
          </button>
          <button
            type="button"
            onClick={() => downloadTaskImportTemplateJson()}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 rounded border border-zinc-200 dark:border-slate-600 px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("import.sampleTasksJson")}
          </button>
          <button
            type="button"
            onClick={() => downloadProjectImportTemplateCsv()}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 rounded border border-zinc-200 dark:border-slate-600 px-2.5 py-1.5 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("import.sampleProjectCsv")}
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full text-left rounded-lg border border-zinc-200 dark:border-slate-600 px-4 py-3 text-sm font-medium text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("import.tasksTitle")}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onImportProject();
            }}
            className="w-full text-left rounded-lg border border-zinc-200 dark:border-slate-600 px-4 py-3 text-sm font-medium text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("dashboard.importChooseProject")}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-xs text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200 py-2"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
