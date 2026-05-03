"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getNotes,
  getSharedNotes,
  createNoteApi,
  updateNoteApi,
  deleteNoteApi,
  syncNotesApi,
  Note,
} from "@/lib/api";
import { mergeOwnNotesFromServer } from "@/lib/notesMerge";
import { useResourceSync, broadcastResourceChange } from "@/lib/useResourceSync";

const LS_KEY = "wroket_notes";
const LS_DIRTY_KEY = "wroket_notes_dirty";
const LS_DELETED_KEY = "wroket_notes_deleted";

/** Clears notes offline cache (own list, dirty queue, pending deletes). */
export function clearNotesLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_DIRTY_KEY);
  localStorage.removeItem(LS_DELETED_KEY);
}

function readLocal(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeLocal(notes: Note[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(notes));
}

function markDirty(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(LS_DIRTY_KEY) ?? "[]");
    const set = new Set([...existing, ...ids]);
    localStorage.setItem(LS_DIRTY_KEY, JSON.stringify([...set]));
  } catch { localStorage.setItem(LS_DIRTY_KEY, JSON.stringify(ids)); }
}

function getDirtyIds(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_DIRTY_KEY) ?? "[]"); }
  catch { localStorage.removeItem(LS_DIRTY_KEY); return []; }
}

function clearDirty() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_DIRTY_KEY);
}

function markDeleted(id: string) {
  if (typeof window === "undefined") return;
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(LS_DELETED_KEY) ?? "[]");
    if (!existing.includes(id)) existing.push(id);
    localStorage.setItem(LS_DELETED_KEY, JSON.stringify(existing));
  } catch { localStorage.setItem(LS_DELETED_KEY, JSON.stringify([id])); }
}

function getDeletedIds(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_DELETED_KEY) ?? "[]"); }
  catch { localStorage.removeItem(LS_DELETED_KEY); return []; }
}

function clearDeleted() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_DELETED_KEY);
}

export function useOfflineNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  /**
   * Merge server own-notes with local cache, persist to localStorage, and return the array.
   * Does NOT call setNotes so the caller can combine with shared notes first.
   */
  const mergeOwnNotes = useCallback((serverNotes: Note[]): Note[] => {
    const local = readLocal();
    const result = mergeOwnNotesFromServer(serverNotes, local, getDirtyIds(), getDeletedIds());
    writeLocal(result);
    return result;
  }, []);

  const fetchAndSync = useCallback(async () => {
    try {
      const [serverNotes, sharedNotes] = await Promise.all([
        getNotes(),
        getSharedNotes().catch((): Note[] => []),
      ]);
      const dirtyIds = getDirtyIds();
      const deletedIds = getDeletedIds();

      // Sync pending deletes
      if (deletedIds.length > 0) {
        setSyncing(true);
        await Promise.allSettled(deletedIds.map((id) => deleteNoteApi(id)));
        clearDeleted();
      }

      // Sync dirty notes
      if (dirtyIds.length > 0) {
        const local = readLocal();
        const dirtyNotes = local.filter((n) => dirtyIds.includes(n.id));
        if (dirtyNotes.length > 0) {
          setSyncing(true);
          const synced = await syncNotesApi(dirtyNotes);
          clearDirty();
          const ownNotes = mergeOwnNotes(synced);
          setNotes(sortNotes([...ownNotes, ...sharedNotes]));
          return;
        }
      }

      clearDirty();
      const ownNotes = mergeOwnNotes(serverNotes);
      setNotes(sortNotes([...ownNotes, ...sharedNotes]));
    } catch {
      const local = readLocal();
      if (local.length > 0) setNotes(local);
    } finally {
      setSyncing(false);
    }
  }, [mergeOwnNotes]);

  // Re-fetch when tab becomes visible or another tab changes notes (cross-tab).
  // Cross-device freshness is handled by the Firestore onSnapshot backend invalidation.
  useResourceSync("notes", fetchAndSync);

  useEffect(() => {
    fetchAndSync().finally(() => setLoading(false));
  }, [fetchAndSync]);

  useEffect(() => {
    if (online && (getDirtyIds().length > 0 || getDeletedIds().length > 0)) {
      fetchAndSync();
    }
  }, [online, fetchAndSync]);

  useEffect(() => {
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, []);

  const sortNotes = (list: Note[]) =>
    [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const addNote = useCallback((title?: string, opts?: { todoId?: string; projectId?: string; shared?: boolean; teamId?: string }) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const noteTitle = title ?? "";
    const shared = opts?.shared && opts?.teamId ? true : undefined;
    const teamId = opts?.shared && opts?.teamId ? opts.teamId : undefined;
    const note: Note = {
      id,
      userId: "",
      title: noteTitle,
      content: "",
      pinned: false,
      todoId: opts?.todoId,
      projectId: opts?.projectId,
      shared,
      teamId,
      createdAt: now,
      updatedAt: now,
    };

    setNotes((prev) => sortNotes([note, ...prev]));
    writeLocal([note, ...readLocal()]);

    if (online) {
      createNoteApi({
        title: noteTitle || "Sans titre",
        content: "",
        id,
        todoId: opts?.todoId,
        projectId: opts?.projectId,
        shared: opts?.shared,
        teamId: opts?.teamId,
      })
        .then(() => broadcastResourceChange("notes"))
        .catch(() => markDirty([id]));
    } else {
      markDirty([id]);
    }

    return id;
  }, [online]);

  const saveNote = useCallback((id: string, updates: {
    title?: string;
    content?: string;
    pinned?: boolean;
    tags?: string[];
    todoId?: string | null;
    projectId?: string | null;
    shared?: boolean;
    teamId?: string | null;
    sharedWithEmail?: string | null;
  }) => {
    const now = new Date().toISOString();

    const mergeLocal = (n: Note): Note => {
      const raw = { ...n, ...updates, updatedAt: now };
      if (updates.shared === false) {
        raw.shared = undefined;
        raw.teamId = undefined;
      }
      if (updates.teamId === null || updates.teamId === "") {
        raw.teamId = undefined;
      }
      // Team share clears individual share in local state
      if (updates.shared === true) {
        raw.sharedWithUid = undefined;
        raw.sharedWithEmail = undefined;
      }
      // Individual share: clear team share in local state
      if (updates.sharedWithEmail !== undefined) {
        if (updates.sharedWithEmail === null) {
          raw.sharedWithUid = undefined;
          raw.sharedWithEmail = undefined;
        } else {
          raw.shared = undefined;
          raw.teamId = undefined;
          raw.sharedWithEmail = updates.sharedWithEmail;
        }
      }
      return raw as Note;
    };

    setNotes((prev) => sortNotes(prev.map((n) => (n.id === id ? mergeLocal(n) : n))));

    const local = readLocal();
    writeLocal(local.map((n) => (n.id === id ? mergeLocal(n) : n)));

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    const hasSharing =
      updates.shared !== undefined ||
      updates.teamId !== undefined ||
      updates.sharedWithEmail !== undefined;
    if (hasSharing && online) {
      const sp: { shared?: boolean; teamId?: string; sharedWithEmail?: string | null } = {};
      if (updates.shared !== undefined) sp.shared = updates.shared;
      if (updates.teamId !== undefined) {
        sp.teamId = updates.teamId === null || updates.teamId === "" ? undefined : updates.teamId;
      }
      if (updates.sharedWithEmail !== undefined) sp.sharedWithEmail = updates.sharedWithEmail;
      updateNoteApi(id, sp).then(() => broadcastResourceChange("notes")).catch(() => markDirty([id]));
    } else if (hasSharing && !online) {
      markDirty([id]);
    }

    const rest: Record<string, unknown> = { ...updates };
    delete rest.shared;
    delete rest.teamId;
    delete rest.sharedWithEmail;
    const restKeys = Object.keys(rest).filter((k) => rest[k] !== undefined);
    if (restKeys.length === 0) return;

    if (online) {
      syncTimerRef.current = setTimeout(async () => {
        try {
          await updateNoteApi(id, rest as Parameters<typeof updateNoteApi>[1]);
          broadcastResourceChange("notes");
        } catch {
          markDirty([id]);
        }
      }, 800);
    } else {
      markDirty([id]);
    }
  }, [online]);

  const removeNote = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    writeLocal(readLocal().filter((n) => n.id !== id));

    if (online) {
      try {
        await deleteNoteApi(id);
        broadcastResourceChange("notes");
      } catch { markDeleted(id); }
    } else {
      markDeleted(id);
    }
  }, [online]);

  const togglePin = useCallback(async (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    saveNote(id, { pinned: !note.pinned });
  }, [notes, saveNote]);

  return {
    notes,
    loading,
    online,
    syncing,
    addNote,
    saveNote,
    removeNote,
    togglePin,
    reload: fetchAndSync,
  };
}
