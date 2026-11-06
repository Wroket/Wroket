"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";

/**
 * Document-style formatting toolbar for the contenteditable note editor.
 * Groups text styles, lists/headings, and secondary actions (OCR).
 */

interface NoteToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
  /** When set, shows “Import from photo” (OCR). */
  onOcr?: () => void;
  /** Propose tasks from the note text. */
  onSpawnTasks?: () => void;
  /** Import a workflow photo. */
  onDiagram?: () => void;
}

interface FormatAction {
  id: string;
  title: string;
  icon: React.ReactNode;
  command?: string;
  block?: string;
  toggle?: boolean;
}

function BoldIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M19 4h-9M14 20H5M15 4 9 20" />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16" />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M5 12h14" />
      <path strokeLinecap="round" d="M16 6c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3" />
      <path strokeLinecap="round" d="M8 18c0 1.7 1.8 3 4 3s4-1.3 4-3-1.8-3-4-3" />
    </svg>
  );
}

function ListUlIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function ListOlIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M4 16h2v2H4" />
    </svg>
  );
}

function HeadingIcon() {
  return (
    <span className="text-[11px] font-semibold leading-none tracking-tight" aria-hidden>
      H2
    </span>
  );
}

function IndentIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h12M3 18h18M7 9l4 3-4 3" />
    </svg>
  );
}

function OutdentIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h12M3 18h18M17 9l-4 3 4 3" />
    </svg>
  );
}

function ScanTextIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5" />
    </svg>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-slate-700 shrink-0" aria-hidden />;
}

export default function NoteToolbar({ editorRef, disabled, onOcr, onSpawnTasks, onDiagram }: NoteToolbarProps) {
  const { t } = useLocale();
  const [active, setActive] = useState<Record<string, boolean>>({});

  const styleActions: FormatAction[] = [
    { id: "bold", title: t("notes.fmtBold"), icon: <BoldIcon />, command: "bold", toggle: true },
    { id: "italic", title: t("notes.fmtItalic"), icon: <ItalicIcon />, command: "italic", toggle: true },
    { id: "underline", title: t("notes.fmtUnderline"), icon: <UnderlineIcon />, command: "underline", toggle: true },
    { id: "strikeThrough", title: t("notes.fmtStrikethrough"), icon: <StrikeIcon />, command: "strikeThrough", toggle: true },
  ];

  const structureActions: FormatAction[] = [
    { id: "h2", title: t("notes.fmtHeading"), icon: <HeadingIcon />, block: "h2" },
    { id: "ul", title: t("notes.fmtBulletList"), icon: <ListUlIcon />, command: "insertUnorderedList", toggle: true },
    { id: "ol", title: t("notes.fmtNumberedList"), icon: <ListOlIcon />, command: "insertOrderedList", toggle: true },
    { id: "indent", title: t("notes.fmtIndent"), icon: <IndentIcon />, command: "indent" },
    { id: "outdent", title: t("notes.fmtOutdent"), icon: <OutdentIcon />, command: "outdent" },
  ];

  const refreshActiveStates = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const inEditor = !!anchor && editor.contains(anchor);
    if (!inEditor) {
      setActive({});
      return;
    }
    setActive({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strikeThrough: document.queryCommandState("strikeThrough"),
      insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      insertOrderedList: document.queryCommandState("insertOrderedList"),
    });
  }, [editorRef]);

  useEffect(() => {
    const onSelectionChange = () => refreshActiveStates();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [refreshActiveStates]);

  const applyFormat = (action: FormatAction) => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    editor.focus();
    if (action.block) {
      const current = document.queryCommandValue("formatBlock");
      const next = current?.toLowerCase() === action.block ? "p" : action.block;
      document.execCommand("formatBlock", false, next);
    } else if (action.command) {
      document.execCommand(action.command, false);
    }
    refreshActiveStates();
  };

  const btnBaseCls =
    "flex items-center justify-center min-w-8 h-8 px-1.5 rounded-md text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const renderGroup = (actions: FormatAction[]) =>
    actions.map((action) => {
      const isOn = !!(action.toggle && action.command && active[action.command]);
      return (
        <button
          key={action.id}
          type="button"
          title={action.title}
          aria-label={action.title}
          aria-pressed={action.toggle ? isOn : undefined}
          disabled={disabled}
          onClick={() => applyFormat(action)}
          className={`${btnBaseCls} ${
            isOn ? "bg-zinc-200/80 text-zinc-900 dark:bg-slate-700 dark:text-slate-100" : ""
          }`}
        >
          {action.icon}
        </button>
      );
    });

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 px-3 sm:px-4 py-1.5 border-b border-zinc-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-0.5">{renderGroup(styleActions)}</div>
      <ToolbarDivider />
      <div className="flex items-center gap-0.5">{renderGroup(structureActions)}</div>
      {(onOcr || onSpawnTasks || onDiagram) && <ToolbarDivider />}
      {onDiagram && (
        <button
          type="button"
          title={t("notes.diagram.button")}
          aria-label={t("notes.diagram.button")}
          disabled={disabled}
          onClick={onDiagram}
          className="inline-flex items-center gap-1.5 h-8 rounded-md px-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-900/50 transition-colors disabled:opacity-40"
        >
          <ScanTextIcon />
          <span className="hidden sm:inline">{t("notes.diagram.button")}</span>
        </button>
      )}
      {onSpawnTasks && (
        <button
          type="button"
          title={t("notes.spawn.button")}
          aria-label={t("notes.spawn.button")}
          disabled={disabled}
          onClick={onSpawnTasks}
          className="inline-flex items-center gap-1.5 h-8 rounded-md px-2.5 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-800 border border-zinc-200 dark:border-slate-700 transition-colors disabled:opacity-40"
        >
          <span className="hidden sm:inline">{t("notes.spawn.button")}</span>
        </button>
      )}
      {onOcr && !onDiagram && (
        <button
          type="button"
          title={t("notes.ocr.importPhoto")}
          aria-label={t("notes.ocr.importPhoto")}
          disabled={disabled}
          onClick={onOcr}
          className="inline-flex items-center gap-1.5 h-8 rounded-md px-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 border border-emerald-200/80 dark:border-emerald-900/50 transition-colors disabled:opacity-40"
        >
          <ScanTextIcon />
          <span className="hidden sm:inline">{t("notes.ocr.importPhoto")}</span>
        </button>
      )}
      <div className="ml-auto text-[10px] text-zinc-400 dark:text-slate-500 hidden md:block pl-2">
        {t("notes.fmtHint")}
      </div>
    </div>
  );
}
