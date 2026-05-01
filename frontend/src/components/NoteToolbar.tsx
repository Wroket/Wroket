"use client";

import { useLocale } from "@/lib/LocaleContext";

/**
 * Formatting toolbar for the note textarea.
 * Wraps the current selection with lightweight markdown-style markers.
 * Markers used:
 *   Bold:          **text**
 *   Italic:        _text_
 *   Underline:     __text__
 *   Strikethrough: ~~text~~
 *   Indent:        inserts two spaces at the start of each selected line
 */

interface NoteToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  onContentChange: (value: string) => void;
  content: string;
}

interface FormatAction {
  label: string;
  title: string;
  icon: React.ReactNode;
  wrap?: [string, string];
  indent?: boolean;
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

export default function NoteToolbar({ textareaRef, disabled, onContentChange, content }: NoteToolbarProps) {
  const { t } = useLocale();

  const actions: FormatAction[] = [
    { label: "B",    title: t("notes.fmtBold"),          icon: <BoldIcon />,      wrap: ["**", "**"] },
    { label: "I",    title: t("notes.fmtItalic"),        icon: <ItalicIcon />,    wrap: ["_", "_"] },
    { label: "U",    title: t("notes.fmtUnderline"),     icon: <UnderlineIcon />, wrap: ["__", "__"] },
    { label: "~~",   title: t("notes.fmtStrikethrough"), icon: <StrikeIcon />,    wrap: ["~~", "~~"] },
    { label: "→|",   title: t("notes.fmtIndent"),        icon: <IndentIcon />,    indent: true },
  ];

  const applyFormat = (action: FormatAction) => {
    const el = textareaRef.current;
    if (!el || disabled) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    let newContent = content;
    let newStart = start;
    let newEnd = end;

    if (action.wrap) {
      const [open, close] = action.wrap;
      const selected = content.slice(start, end);
      const insertion = `${open}${selected || t("notes.fmtPlaceholder")}${close}`;
      newContent = content.slice(0, start) + insertion + content.slice(end);
      newStart = start + open.length;
      newEnd = newStart + (selected || t("notes.fmtPlaceholder")).length;
    } else if (action.indent) {
      // Indent each line in the selection by 2 spaces.
      const prefix = "  ";
      const beforeSelection = content.slice(0, start);
      const selected = content.slice(start, end) || "";
      const after = content.slice(end);
      // Find the beginning of the first selected line.
      const lineStart = beforeSelection.lastIndexOf("\n") + 1;
      const selectedWithLineStart = content.slice(lineStart, end);
      const indented = selectedWithLineStart.replace(/^/gm, prefix);
      newContent = content.slice(0, lineStart) + indented + after;
      // Adjust cursor offsets.
      const addedChars = indented.length - selectedWithLineStart.length;
      newStart = start + prefix.length;
      newEnd = end + addedChars;
    }

    onContentChange(newContent);

    // Restore selection after React re-render.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(newStart, newEnd);
    });
  };

  const btnCls =
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
          className={btnCls}
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
