"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Collaboration, { isChangeOrigin } from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";

import { useNoteCollab } from "@/components/notes/NoteCollabProvider";
import { fragmentNameForBlock } from "@/lib/noteCollabYdoc";

interface TipTapCollabTextProps {
  blockId: string;
  /** Seed HTML when the Yjs fragment is empty (first open). */
  initialHtml: string;
  readOnly?: boolean;
  locale: string;
  placeholder: string;
  /** Expose ProseMirror DOM for legacy slash/toolbar fallbacks. */
  onDomReady?: (el: HTMLDivElement | null) => void;
  onFocus?: () => void;
  onHtmlChange?: (html: string) => void;
  onCursorChange?: (from: number, to: number) => void;
}

/**
 * TipTap text zone bound to a Yjs XmlFragment (`block:{id}`) for CRDT collab.
 * Do not put `editable` in useEditor deps — remounting Collaboration on the same
 * Y.Doc (e.g. shared note RO→RW after /live) throws and trips ErrorBoundary.
 */
export default function TipTapCollabText({
  blockId,
  initialHtml,
  readOnly = false,
  locale,
  placeholder,
  onDomReady,
  onFocus,
  onHtmlChange,
  onCursorChange,
}: TipTapCollabTextProps) {
  const { ydoc, synced, canWrite, registerEditor, setFocusedBlockId } = useNoteCollab();
  const editable = !readOnly && canWrite;
  const seededRef = useRef(false);

  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({ heading: { levels: [2] }, undoRedo: false }),
      Underline,
      Placeholder.configure({ placeholder }),
    ];
    if (ydoc) {
      base.push(
        Collaboration.configure({
          document: ydoc,
          field: fragmentNameForBlock(blockId),
        }) as never,
      );
    }
    return base;
  }, [ydoc, blockId, placeholder]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      editable,
      content: ydoc ? undefined : initialHtml || "",
      editorProps: {
        attributes: {
          lang: locale,
          class:
            "note-doc-body w-full min-h-[8rem] text-[16px] sm:text-[17px] text-zinc-800 dark:text-slate-200 bg-transparent border-none outline-none leading-7 prose-p:my-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2",
        },
      },
      onUpdate: ({ editor: ed, transaction }) => {
        // Remote Yjs / peer edits must not mark the note dirty (LWW conflict toast).
        if (isChangeOrigin(transaction)) return;
        onHtmlChange?.(ed.getHTML());
      },
      onSelectionUpdate: ({ editor: ed }) => {
        const { from, to } = ed.state.selection;
        onCursorChange?.(from, to);
      },
      onFocus: ({ editor: ed }) => {
        setFocusedBlockId(blockId);
        onFocus?.();
        const dom = ed.view.dom as HTMLDivElement;
        onDomReady?.(dom);
      },
    },
    [ydoc, blockId],
  );

  /**
   * Seed HTML into Yjs only after first sync pull, and only if the fragment is still empty.
   * emitUpdate:true so peers receive the seed via CRDT (false left TipTap local-only).
   */
  useEffect(() => {
    if (!editor || !ydoc || !synced || seededRef.current) return;
    seededRef.current = true;
    if (!initialHtml || !editor.isEmpty) return;
    editor.commands.setContent(initialHtml, { emitUpdate: true });
  }, [editor, ydoc, synced, initialHtml]);

  useEffect(() => {
    seededRef.current = false;
  }, [blockId, ydoc]);

  useEffect(() => {
    if (!editor) return;
    registerEditor(blockId, editor);
    return () => registerEditor(blockId, null);
  }, [editor, blockId, registerEditor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          lang: locale,
          class:
            "note-doc-body w-full min-h-[8rem] text-[16px] sm:text-[17px] text-zinc-800 dark:text-slate-200 bg-transparent border-none outline-none leading-7 prose-p:my-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2",
        },
      },
    });
  }, [editor, locale]);

  useEffect(() => {
    if (!editor) return;
    onDomReady?.(editor.view.dom as HTMLDivElement);
  }, [editor, onDomReady]);

  if (!ydoc) {
    return (
      <div
        className="note-doc-body w-full min-h-[8rem] text-[16px] sm:text-[17px] text-zinc-500 dark:text-slate-400 leading-7"
        aria-busy
      >
        …
      </div>
    );
  }

  if (!editor) return null;

  return <EditorContent editor={editor} />;
}

export type { Editor };
