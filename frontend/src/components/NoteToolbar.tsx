"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";

/**
 * Rich text toolbar for the contenteditable note editor.
 * Applies formatting commands directly to the current selection.
 */

interface NoteToolbarProps {
  editorRef: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

interface FormatAction {
  label: string;
  title: string;
  icon: React.ReactNode;
  command: string;
  toggle?: boolean;
}

function BoldIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M19 4h-9M14 20H5M15 4 9 20" />
    </svg>
  );
}

function UnderlineIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16" />
    </svg>
  );
}

function StrikeIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M5 12h14" />
      <path strokeLinecap="round" d="M16 6c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 3 4 3" />
      <path strokeLinecap="round" d="M8 18c0 1.7 1.8 3 4 3s4-1.3 4-3-1.8-3-4-3" />
    </svg>
  );
}

function IndentIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h12M3 18h18M7 9l4 3-4 3" />
    </svg>
  );
}

function OutdentIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h12M3 18h18M17 9l-4 3 4 3" />
    </svg>
  );
}

export default function NoteToolbar({ editorRef, disabled }: NoteToolbarProps) {
  const { t } = useLocale();
  const [active, setActive] = useState<Record<string, boolean>>({});

  const actions: FormatAction[] = [
    { label: "B", title: t("notes.fmtBold"), icon: <BoldIcon />, command: "bold", toggle: true },
    { label: "I", title: t("notes.fmtItalic"), icon: <ItalicIcon />, command: "italic", toggle: true },
    { label: "U", title: t("notes.fmtUnderline"), icon: <UnderlineIcon />, command: "underline", toggle: true },
    { label: "~~", title: t("notes.fmtStrikethrough"), icon: <StrikeIcon />, command: "strikeThrough", toggle: true },
    { label: "→|", title: t("notes.fmtIndent"), icon: <IndentIcon />, command: "indent" },
    { label: "|←", title: t("notes.fmtOutdent"), icon: <OutdentIcon />, command: "outdent" },
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
    document.execCommand(action.command, false);
    refreshActiveStates();
  };

  const btnBaseCls =
    "flex items-center justify-center w-7 h-7 rounded text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-700 hover:text-zinc-900 dark:hover:text-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      className="flex items-center gap-0.5 px-3 py-1 border-b border-zinc-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0"
      onMouseDown={(e) => e.preventDefault()}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.title}
          disabled={disabled}
          onClick={() => applyFormat(action)}
          className={`${btnBaseCls} ${
            action.toggle && active[action.command]
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
              : ""
          }`}
        >
          {action.icon}
        </button>
      ))}
      <div className="ml-auto text-[10px] text-zinc-300 dark:text-slate-600 hidden sm:block">
        {t("notes.fmtHint")}
      </div>
    </div>
  );
}
