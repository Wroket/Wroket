"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import type { Editor } from "@tiptap/react";

import { syncYdocHttp } from "@/lib/noteCollabYdoc";

interface NoteCollabContextValue {
  ydoc: Y.Doc | null;
  noteId: string | null;
  canWrite: boolean;
  registerEditor: (blockId: string, editor: Editor | null) => void;
  getActiveEditor: () => Editor | null;
  setFocusedBlockId: (blockId: string | null) => void;
  focusedBlockId: string | null;
}

const NoteCollabContext = createContext<NoteCollabContextValue>({
  ydoc: null,
  noteId: null,
  canWrite: true,
  registerEditor: () => {},
  getActiveEditor: () => null,
  setFocusedBlockId: () => {},
  focusedBlockId: null,
});

export function useNoteCollab(): NoteCollabContextValue {
  return useContext(NoteCollabContext);
}

/**
 * One Y.Doc per open note + HTTP sync loop (Cloud Run–safe, no sticky WS).
 */
export function NoteCollabProvider({
  noteId,
  canWrite,
  enabled,
  children,
  syncIntervalMs = 2000,
}: {
  noteId: string | null;
  canWrite: boolean;
  /** When false, children still render but without Yjs (read-only shared notes can keep TipTap RO). */
  enabled: boolean;
  children: ReactNode;
  syncIntervalMs?: number;
}) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const editorsRef = useRef<Map<string, Editor>>(new Map());
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;

  useEffect(() => {
    if (!noteId || !enabled) {
      setYdoc(null);
      return;
    }
    const doc = new Y.Doc();
    setYdoc(doc);
    let cancelled = false;
    const sync = async () => {
      if (cancelled) return;
      try {
        await syncYdocHttp(noteId, doc, { push: canWriteRef.current });
      } catch {
        /* transient */
      }
    };
    void sync();
    const id = window.setInterval(() => void sync(), syncIntervalMs);
    let debounce: number | undefined;
    const onUpdate = () => {
      if (!canWriteRef.current) return;
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void sync(), 400);
    };
    doc.on("update", onUpdate);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (debounce) window.clearTimeout(debounce);
      doc.off("update", onUpdate);
      doc.destroy();
      setYdoc(null);
    };
  }, [noteId, enabled, syncIntervalMs]);

  const registerEditor = useCallback((blockId: string, editor: Editor | null) => {
    if (!editor) {
      editorsRef.current.delete(blockId);
      return;
    }
    editorsRef.current.set(blockId, editor);
  }, []);

  const getActiveEditor = useCallback(() => {
    if (focusedBlockId && editorsRef.current.has(focusedBlockId)) {
      return editorsRef.current.get(focusedBlockId) ?? null;
    }
    const first = editorsRef.current.values().next();
    return first.done ? null : first.value;
  }, [focusedBlockId]);

  const value = useMemo(
    () => ({
      ydoc,
      noteId,
      canWrite,
      registerEditor,
      getActiveEditor,
      setFocusedBlockId,
      focusedBlockId,
    }),
    [ydoc, noteId, canWrite, registerEditor, getActiveEditor, focusedBlockId],
  );

  return <NoteCollabContext.Provider value={value}>{children}</NoteCollabContext.Provider>;
}
