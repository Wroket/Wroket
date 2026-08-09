"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE_URL, apiFetchDefaults } from "@/lib/api/core";
import type { Note } from "@/lib/api";

export interface NotePresencePeer {
  uid: string;
  displayName: string;
  at: string;
}

/**
 * Poll live note content + presence while a note is open (Firestore-friendly path without sticky WS).
 * Applies remote content only when local is not dirty and remote updatedAt is newer.
 */
export function useNoteLiveCollab(opts: {
  noteId: string | null;
  displayName: string;
  localUpdatedAt: string | null;
  isDirty: boolean;
  onRemoteNote: (note: Note, canWrite: boolean) => void;
  intervalMs?: number;
}) {
  const { noteId, displayName, localUpdatedAt, isDirty, onRemoteNote, intervalMs = 1800 } = opts;
  const [presence, setPresence] = useState<NotePresencePeer[]>([]);
  const [canWrite, setCanWrite] = useState(true);
  const onRemoteRef = useRef(onRemoteNote);
  onRemoteRef.current = onRemoteNote;

  const tick = useCallback(async () => {
    if (!noteId) return;
    try {
      await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/presence`, {
        ...apiFetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
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
      if (
        !isDirty &&
        localUpdatedAt &&
        data.note.updatedAt &&
        new Date(data.note.updatedAt) > new Date(localUpdatedAt)
      ) {
        onRemoteRef.current(data.note, data.canWrite);
      }
    } catch {
      /* ignore transient */
    }
  }, [noteId, displayName, isDirty, localUpdatedAt]);

  useEffect(() => {
    if (!noteId) {
      setPresence([]);
      return;
    }
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => window.clearInterval(id);
  }, [noteId, tick, intervalMs]);

  return { presence, canWrite };
}
