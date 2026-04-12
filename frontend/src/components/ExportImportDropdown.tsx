"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "./Toast";

const MENU_WIDTH = 280;

interface Props {
  exportCsv: () => Promise<void>;
  exportJson: () => Promise<void>;
  /** Direct import: run after file pick (legacy). */
  onImport?: (file: File) => Promise<{ created: number; errors: Array<{ row: number; message: string }>; total: number }>;
  /** If set, file pick calls this instead of onImport (e.g. open preview modal). */
  onImportFile?: (file: File) => void;
  templateCsv?: string;
  templateJson?: string;
}

export default function ExportImportDropdown({ exportCsv, exportJson, onImport, onImportFile, templateCsv, templateJson }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: Array<{ row: number; message: string }>; total: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = r.right - MENU_WIDTH;
    if (left < 8) left = 8;
    if (left + MENU_WIDTH > window.innerWidth - 8) left = Math.max(8, window.innerWidth - MENU_WIDTH - 8);
    setMenuPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updateMenuPosition();
    const onResize = () => updateMenuPosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateMenuPosition]);

  const handleExport = async (action: () => Promise<void>) => {
    close();
    try {
      await action();
    } catch {
      toast.error(t("export.error"));
    }
  };

  const runImport = async (file: File) => {
    if (onImportFile) {
      onImportFile(file);
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
    }
  };

  const handleCsvFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (csvFileRef.current) csvFileRef.current.value = "";
    if (!file) return;
    close();
    await runImport(file);
  };

  const handleJsonFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (jsonFileRef.current) jsonFileRef.current.value = "";
    if (!file) return;
    close();
    await runImport(file);
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

  const hasImport = Boolean(onImport || onImportFile);

  const menu =
    open && mounted && menuPos
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[200]" aria-hidden onClick={close} />
            <div
              role="menu"
              className="fixed z-[201] rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-2 text-sm"
              style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
            >
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                {t("export.sectionExport")}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleExport(exportCsv)}
                className="w-full text-left px-3 py-2 text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
              >
                {t("export.asCsv")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleExport(exportJson)}
                className="w-full text-left px-3 py-2 text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
              >
                {t("export.asJson")}
              </button>

              {hasImport && (
                <>
                  <div className="my-2 border-t border-zinc-100 dark:border-slate-700" />
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                    {t("export.sectionImport")}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={importing}
                    onClick={() => csvFileRef.current?.click()}
                    className="w-full text-left px-3 py-2 text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {importing ? "…" : t("import.asCsv")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={importing}
                    onClick={() => jsonFileRef.current?.click()}
                    className="w-full text-left px-3 py-2 text-zinc-800 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {importing ? "…" : t("import.asJson")}
                  </button>
                </>
              )}
              {(templateCsv || templateJson) && (
                <>
                  <div className="my-2 border-t border-zinc-100 dark:border-slate-700" />
                  <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                    {t("import.templates")}
                  </div>
                  {templateCsv && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        downloadTemplate(templateCsv, "template.csv");
                        close();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {t("import.downloadCsvTemplate")}
                    </button>
                  )}
                  {templateJson && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        downloadTemplate(templateJson, "template.json");
                        close();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {t("import.downloadJsonTemplate")}
                    </button>
                  )}
                </>
              )}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div className="relative inline-flex" ref={triggerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        {t("export.button")}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {menu}

      <input ref={csvFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFileChange} />
      <input ref={jsonFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleJsonFileChange} />

      {importResult && importResult.errors.length > 0 && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/30" onClick={() => setImportResult(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-5 max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-slate-200 mb-2">
              {importResult.created} / {importResult.total} imported
            </h3>
            <p className="text-xs text-red-500 mb-2">{importResult.errors.length} error(s):</p>
            <ul className="text-xs space-y-1 text-zinc-600 dark:text-slate-400">
              {importResult.errors.slice(0, 50).map((e, i) => (
                <li key={i}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setImportResult(null)} className="mt-3 text-xs text-cyan-600 hover:underline">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
