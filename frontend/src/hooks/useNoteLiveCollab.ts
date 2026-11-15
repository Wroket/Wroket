"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE_URL, apiFetchDefaults } from "@/lib/api/core";
import type { Note } from "@/lib/api";

export interface NotePresencePeer {
  uid: string;
  displayName: string;
  at: string;
  cursor?: { blockId: string; from: number; to: number } | null;
}

/**
 * Poll live note content + presence while a note is open (Firestore-friendly path without sticky WS).
 * Applies remote content only when local is not dirty and remote updatedAt is newer.
 * When dirty and remote is newer, sets remoteConflict so the UI can offer reload / keep editing.
 */
export function useNoteLiveCollab(opts: {
  noteId: string | null;
  displayName: string;
  localUpdatedAt: string | null;
  isDirty: boolean;
  cursor?: NotePresencePeer["cursor"];
  onRemoteNote: (note: Note, canWrite: boolean) => void;
  intervalMs?: number;
}) {
  const { noteId, displayName, localUpdatedAt, isDirty, cursor, onRemoteNote, intervalMs = 1800 } = opts;
  const [presence, setPresence] = useState<NotePresencePeer[]>([]);
  /** False until /live answers — avoids RW flash on foreign notes. */
  const [canWrite, setCanWrite] = useState(false);
  const [remoteConflict, setRemoteConflict] = useState(false);
  const onRemoteRef = useRef(onRemoteNote);
  onRemoteRef.current = onRemoteNote;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const tick = useCallback(async () => {
    if (!noteId) return;
    try {
      await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/presence`, {
        ...apiFetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, cursor: cursorRef.current ?? null }),
      });
      const res = await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/live`, {
        ...apiFetchDefaults,
        method: "GET",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        note: Note;
        canWrite: boolean;
        presence: NotePresencePeer[];
      };
      setPresence(data.presence ?? []);
      setCanWrite(data.canWrite);
      const remoteNewer =
        !!localUpdatedAt &&
        !!data.note.updatedAt &&
        new Date(data.note.updatedAt) > new Date(localUpdatedAt);
      if (remoteNewer && isDirtyRef.current) {
        setRemoteConflict(true);
        return;
      }
      if (remoteNewer && !isDirtyRef.current) {
        setRemoteConflict(false);
        onRemoteRef.current(data.note, data.canWrite);
      }
    } catch {
      /* ignore transient */
    }
  }, [noteId, displayName, localUpdatedAt]);

  useEffect(() => {
    if (!noteId) {
      setPresence([]);
      setRemoteConflict(false);
      setCanWrite(false);
      return;
    }
    setCanWrite(false);
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => window.clearInterval(id);
  }, [noteId, tick, intervalMs]);

  const clearRemoteConflict = useCallback(() => setRemoteConflict(false), []);

  /** Apply remote even if local was dirty (Reload banner). Clears dirty ref first. */
  const forcePullRemote = useCallback(async () => {
    isDirtyRef.current = false;
    setRemoteConflict(false);
    await tick();
  }, [tick]);

  return {
    presence,
    canWrite,
    remoteConflict,
    clearRemoteConflict,
    refresh: tick,
    forcePullRemote,
  };
}
