"use client";

import { useEffect, useRef, useState } from "react";

import NoteDiagramEditor from "@/components/notes/NoteDiagramEditor";
import { useLocale } from "@/lib/LocaleContext";
import type { NoteBlock, NoteDiagramEdge, NoteDiagramNode } from "@/lib/api/notes";
import type { Project } from "@/lib/api/projects";
import { diagramFromBlock, newBlockId } from "@/lib/noteBlocks";

interface NoteDocumentProps {
  noteId: string;
  blocks: NoteBlock[];
  readOnly?: boolean;
  refreshKey?: number;
  /** Toolbar and slash commands use whichever text zone was focused last. */
  editorRef?: React.RefObject<HTMLDivElement | null>;
  onFocusText?: (blockId: string) => void;
  onCommit: (blocks: NoteBlock[]) => void;
  /** Turns a diagram's boxes into project tasks after a confirmation. */
  diagramApply?: {
    projects: Project[];
    defaultProjectId?: string | null;
    parentId?: string | null;
    onCreated?: () => void;
  };
}

/**
 * Ordered text and diagram zones of one note.
 * A grip handle reorders them. Typing stays in the text zone and is not a drag.
 */
export default function NoteDocument({
  noteId,
  blocks,
  readOnly = false,
  refreshKey = 0,
  editorRef,
  onFocusText,
  onCommit,
  diagramApply,
}: NoteDocumentProps) {
  const { t, locale } = useLocale();
  const [askRemoveId, setAskRemoveId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const move = (targetId: string) => {
    const fromId = dragId.current;
    dragId.current = null;
    if (!fromId || fromId === targetId) return;
    const next = [...blocks];
    const fromIndex = next.findIndex((block) => block.id === fromId);
    const toIndex = next.findIndex((block) => block.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [item] = next.splice(fromIndex, 1);
    if (!item) return;
    next.splice(toIndex, 0, item);
    onCommit(next);
  };

  return (
    <div className="mb-4 space-y-4">
      {blocks.map((block) => (
        <section
          key={block.id}
          onDragOver={(event) => {
            if (readOnly) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!readOnly) move(block.id);
          }}
          className="space-y-1"
        >
          {!readOnly && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                draggable
                aria-label={t("notes.blocks.drag")}
                onDragStart={(event) => {
                  dragId.current = block.id;
                  event.dataTransfer.setData("text/plain", block.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => { dragId.current = null; }}
                className="cursor-grab rounded px-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                ⋮⋮
              </button>
              <span className="text-[11px] font-medium text-zinc-500 dark:text-slate-400">
                {block.type === "text" ? t("notes.blocks.text") : t("notes.blocks.diagram")}
              </span>
              {blocks.length > 1 && askRemoveId !== block.id && (
                <button
                  type="button"
                  onClick={() => setAskRemoveId(block.id)}
                  className="ml-auto text-[11px] text-zinc-400 hover:text-red-600"
                >
                  {t("notes.blocks.remove")}
                </button>
              )}
              {askRemoveId === block.id && (
                <span className="ml-auto flex items-center gap-2 text-[11px]">
                  <span className="text-zinc-600 dark:text-slate-300">{t("notes.blocks.removeAsk")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onCommit(blocks.filter((item) => item.id !== block.id));
                      setAskRemoveId(null);
                    }}
                    className="font-medium text-red-600"
                  >
                    {t("notes.blocks.remove")}
                  </button>
                  <button type="button" onClick={() => setAskRemoveId(null)} className="text-zinc-500">
                    {t("notes.spawn.cancel")}
                  </button>
                </span>
              )}
            </div>
          )}
          {block.type === "text" ? (
            <TextZone
              html={block.html}
              readOnly={readOnly}
              locale={locale}
              placeholder={t("notes.contentPlaceholder")}
              editorRef={editorRef}
              onFocus={() => onFocusText?.(block.id)}
              onChange={(html) => {
                onCommit(blocks.map((item) => (
                  item.type === "text" && item.id === block.id ? { ...item, html } : item
                )));
              }}
            />
          ) : (
            <NoteDiagramEditor
              noteId={noteId}
              blockId={block.id}
              diagram={diagramFromBlock(block)}
              readOnly={readOnly}
              refreshKey={refreshKey}
              apply={readOnly ? undefined : diagramApply}
              onSaved={(saved) => {
                if (!saved) return;
                onCommit(blocks.map((item) => (
                  item.type === "diagram" && item.id === block.id
                    ? { ...item, nodes: saved.nodes, edges: saved.edges }
                    : item
                )));
              }}
            />
          )}
        </section>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onCommit([...blocks, { id: newBlockId(), type: "text", html: "" }])}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t("notes.blocks.addText")}
          </button>
          <button
            type="button"
            onClick={() => onCommit([...blocks, { id: newBlockId(), type: "diagram", nodes: [], edges: [] }])}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t("notes.blocks.addDiagram")}
          </button>
        </div>
      )}
    </div>
  );
}

function TextZone({
  html,
  readOnly,
  locale,
  placeholder,
  editorRef,
  onFocus,
  onChange,
}: {
  html: string;
  readOnly: boolean;
  locale: string;
  placeholder: string;
  editorRef?: React.RefObject<HTMLDivElement | null>;
  onFocus: () => void;
  onChange: (html: string) => void;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = localRef.current;
    if (!element || document.activeElement === element) return;
    if (element.innerHTML !== html) element.innerHTML = html || "";
  }, [html]);
  return (
    <div
      ref={(element) => {
        localRef.current = element;
        if (!element || !editorRef) return;
        if (!editorRef.current || !editorRef.current.isConnected) editorRef.current = element;
      }}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck
      lang={locale}
      onFocus={() => {
        if (localRef.current && editorRef) editorRef.current = localRef.current;
        onFocus();
      }}
      onInput={() => { if (localRef.current) onChange(localRef.current.innerHTML); }}
      data-placeholder={readOnly ? "" : placeholder}
      className={`note-doc-body w-full min-h-[8rem] text-[16px] sm:text-[17px] text-zinc-800 dark:text-slate-200 bg-transparent border-none outline-none leading-7 empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-300 dark:empty:before:text-slate-600 empty:before:pointer-events-none [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_p]:my-2 ${
        readOnly ? "cursor-default" : ""
      }`}
    />
  );
}

export type { NoteDiagramNode, NoteDiagramEdge };
