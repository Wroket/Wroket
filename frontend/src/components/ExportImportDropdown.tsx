"use client";

import { useCallback, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "./Toast";

export interface ExportOption {
  label: string;
  action: () => Promise<void>;
}

interface Props {
  exportOptions: ExportOption[];
  /** Direct import: run after file pick (legacy). */
  onImport?: (file: File) => Promise<{ created: number; errors: Array<{ row: number; message: string }>; total: number }>;
  /** If set, file pick calls this instead of onImport (e.g. open preview modal). */
  onImportFile?: (file: File) => void;
  importLabel?: string;
  templateCsv?: string;
  templateJson?: string;
  children?: ReactNode;
}

export default function ExportImportDropdown({ exportOptions, onImport, onImportFile, importLabel, templateCsv, templateJson }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: Array<{ row: number; message: string }>; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpen(false); }, []);

  const handleExport = async (action: () => Promise<void>) => {
    close();
    try {
      await action();
    } catch {
      toast.error(t("export.error"));
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    close();
    if (onImportFile) {
      onImportFile(file);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (!onImport) return;
    setImporting(true);
    try {
      const result = await onImport(file);
      setImportResult(result);
      if (result.created > 0) {
        toast.success(`${result.created}/${result.total} imported`);
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} error(s)`);
      }
    } catch {
      toast.error(t("export.error"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadTemplate = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        {t("export.button")}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute right-0 z-40 mt-1 w-60 rounded-md border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm">
            {exportOptions.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleExport(opt.action)}
                className="w-full text-left px-3 py-1.5 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
              >
                {opt.label}
              </button>
            ))}

            {(onImport || onImportFile) && (
              <>
                <div className="border-t border-zinc-100 dark:border-slate-700 my-1" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="w-full text-left px-3 py-1.5 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
                >
                  {importing ? "..." : (importLabel ?? t("export.import"))}
                </button>
              </>
            )}

            {(templateCsv || templateJson) && (
              <>
                <div className="border-t border-zinc-100 dark:border-slate-700 my-1" />
                {templateCsv && (
                  <button
                    type="button"
                    onClick={() => { downloadTemplate(templateCsv, "template.csv"); close(); }}
                    className="w-full text-left px-3 py-1.5 text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors text-xs"
                  >
                    {t("import.downloadCsvTemplate")}
                  </button>
                )}
                {templateJson && (
                  <button
                    type="button"
                    onClick={() => { downloadTemplate(templateJson, "template.json"); close(); }}
                    className="w-full text-left px-3 py-1.5 text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors text-xs"
                  >
                    {t("import.downloadJsonTemplate")}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileChange} />

      {importResult && importResult.errors.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setImportResult(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-5 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-slate-200 mb-2">
              {importResult.created} / {importResult.total} imported
            </h3>
            <p className="text-xs text-red-500 mb-2">{importResult.errors.length} error(s):</p>
            <ul className="text-xs space-y-1 text-zinc-600 dark:text-slate-400">
              {importResult.errors.slice(0, 50).map((e, i) => (
                <li key={i}>Row {e.row}: {e.message}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setImportResult(null)} className="mt-3 text-xs text-cyan-600 hover:underline">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
