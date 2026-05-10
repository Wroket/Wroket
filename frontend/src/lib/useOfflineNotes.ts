"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getNotes,
  getSharedNotes,
  getMe,
  createNoteApi,
  updateNoteApi,
  deleteNoteApi,
  syncNotesApi,
  Note,
} from "@/lib/api";
import { mergeOwnNotesFromServer } from "@/lib/notesMerge";
import { broadcastResourceChange, useResourceSync } from "@/lib/useResourceSync";

/** Periodic server pull while Notes is mounted and tab visible (multi-device). */
const NOTES_RESOURCE_POLL_MS = 90_000;

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
  const notesRef = useRef<Note[]>([]);
  notesRef.current = notes;

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

  const refetchNotesFromServer = useCallback(() => {
    void fetchAndSync();
  }, [fetchAndSync]);

  useResourceSync("notes", refetchNotesFromServer, { pollIntervalMs: NOTES_RESOURCE_POLL_MS });

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

  const addNote = useCallback((title?: string, opts?: { todoId?: string; projectId?: string; shared?: boolean; teamId?: string; folder?: string }) => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const noteTitle = title ?? "";
    const shared = opts?.shared && opts?.teamId ? true : undefined;
    const teamId = opts?.shared && opts?.teamId ? opts.teamId : undefined;
    const folderTrim = opts?.folder?.trim() || undefined;
    const note: Note = {
      id,
      userId: "",
      title: noteTitle,
      content: "",
      pinned: false,
      folder: folderTrim,
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
        folder: folderTrim,
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
    folder?: string;
    todoId?: string | null;
    projectId?: string | null;
    shared?: boolean;
    teamId?: string | null;
    sharedWithEmail?: string | null;
  }) => {
    const now = new Date().toISOString();

    const mergeLocal = (n: Note): Note => {
      const raw = { ...n, ...updates, updatedAt: now } as Note;
      if ("folder" in updates) {
        const fv = updates.folder;
        if (fv === undefined || fv === null || fv.trim() === "") {
          delete raw.folder;
        } else {
          raw.folder = fv.trim();
        }
      }
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

  /**
   * Upload all own notes to the server via /notes/sync (title, content, pinned).
   * Uses fresh timestamps so the server applies them over older server copies.
   * Shared (read-only) notes from others are skipped. Pending offline deletes run first.
   */
  const pushToServer = useCallback(async () => {
    if (!navigator.onLine) throw new Error("offline");
    setSyncing(true);
    try {
      const deletedIds = getDeletedIds();
      if (deletedIds.length > 0) {
        await Promise.allSettled(deletedIds.map((id) => deleteNoteApi(id)));
        clearDeleted();
      }

      const { uid } = await getMe();
      const own = notesRef.current.filter((n) => !n.userId || n.userId === uid);
      if (own.length > 0) {
        const base = Date.now();
        const payload = own.map((n, i) => ({
          id: n.id,
          title: (n.title || "").trim() || "Sans titre",
          content: n.content ?? "",
          updatedAt: new Date(base + i).toISOString(),
          pinned: n.pinned,
          ...(n.folder ? { folder: n.folder } : {}),
        }));
        for (let offset = 0; offset < payload.length; offset += 200) {
          await syncNotesApi(payload.slice(offset, offset + 200));
        }
        clearDirty();
      }

      await fetchAndSync();
      broadcastResourceChange("notes");
    } finally {
      setSyncing(false);
    }
  }, [fetchAndSync]);

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
    pushToServer,
  };
}
