"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getNotes,
  createNoteApi,
  updateNoteApi,
  deleteNoteApi,
  syncNotesApi,
  Note,
} from "@/lib/api";

const LS_KEY = "wroket_notes";
const LS_DIRTY_KEY = "wroket_notes_dirty";
const LS_DELETED_KEY = "wroket_notes_deleted";

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

  const mergeServerNotes = useCallback((serverNotes: Note[]) => {
    const local = readLocal();
    const merged = new Map<string, Note>();
    for (const n of serverNotes) merged.set(n.id, n);
    for (const n of local) {
      const existing = merged.get(n.id);
      if (!existing || new Date(n.updatedAt) > new Date(existing.updatedAt)) {
        merged.set(n.id, n);
      }
    }
    const result = [...merged.values()].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    writeLocal(result);
    setNotes(result);
    return result;
  }, []);

  const fetchAndSync = useCallback(async () => {
    try {
      const serverNotes = await getNotes();
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
          mergeServerNotes(synced);
          return;
        }
      }

      clearDirty();
      mergeServerNotes(serverNotes);
    } catch {
      const local = readLocal();
      if (local.length > 0) setNotes(local);
    } finally {
      setSyncing(false);
    }
  }, [mergeServerNotes]);

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

  const addNote = useCallback(async (title?: string) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const note: Note = {
      id,
      userId: "",
      title: title || "Sans titre",
      content: "",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };

    setNotes((prev) => sortNotes([note, ...prev]));
    writeLocal([note, ...readLocal()]);

    if (online) {
      try {
        const created = await createNoteApi({ title: note.title, content: "", id });
        setNotes((prev) => sortNotes(prev.map((n) => (n.id === id ? created : n))));
        writeLocal(readLocal().map((n) => (n.id === id ? created : n)));
      } catch {
        markDirty([id]);
      }
    } else {
      markDirty([id]);
    }

    return id;
  }, [online]);

  const saveNote = useCallback((id: string, updates: { title?: string; content?: string; pinned?: boolean }) => {
    const now = new Date().toISOString();

    setNotes((prev) => sortNotes(prev.map((n) =>
      n.id === id ? { ...n, ...updates, updatedAt: now } : n
    )));

    const local = readLocal();
    writeLocal(local.map((n) =>
      n.id === id ? { ...n, ...updates, updatedAt: now } : n
    ));

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

    if (online) {
      syncTimerRef.current = setTimeout(async () => {
        try {
          await updateNoteApi(id, updates);
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
      try { await deleteNoteApi(id); } catch { markDeleted(id); }
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
  };
}
