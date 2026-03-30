import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title?: string;
  content?: string;
  id?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  pinned?: boolean;
}

const notesByUser = new Map<string, Map<string, Note>>();

function persist(): void {
  const obj: Record<string, Record<string, Note>> = {};
  notesByUser.forEach((notes, uid) => {
    obj[uid] = {};
    notes.forEach((note, id) => { obj[uid][id] = note; });
  });
  const store = getStore();
  store.notes = obj;
  scheduleSave("notes");
}

(function hydrate() {
  const store = getStore();
  if (store.notes) {
    let count = 0;
    for (const [uid, notes] of Object.entries(store.notes)) {
      const map = new Map<string, Note>();
      for (const [id, note] of Object.entries(notes as Record<string, Note>)) {
        map.set(id, note);
        count++;
      }
      notesByUser.set(uid, map);
    }
    console.log("[notes] %d note(s) chargée(s)", count);
  }
})();

function getUserNotes(userId: string): Map<string, Note> {
  let map = notesByUser.get(userId);
  if (!map) {
    map = new Map();
    notesByUser.set(userId, map);
  }
  return map;
}

export function listNotes(userId: string): Note[] {
  const notes = Array.from(getUserNotes(userId).values());
  return notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function getNote(userId: string, noteId: string): Note {
  const note = getUserNotes(userId).get(noteId);
  if (!note) throw new NotFoundError("Note introuvable");
  return note;
}

export function createNote(userId: string, input: CreateNoteInput): Note {
  const title = (input.title ?? "").trim();
  if (title.length > 200) throw new ValidationError("Titre trop long (max 200 caractères)");
  const content = input.content ?? "";
  if (content.length > 50_000) throw new ValidationError("Contenu trop long (max 50 000 caractères)");

  const now = new Date().toISOString();
  const note: Note = {
    id: input.id || crypto.randomUUID(),
    userId,
    title: title || "Sans titre",
    content,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };

  getUserNotes(userId).set(note.id, note);
  persist();
  return note;
}

export function updateNote(userId: string, noteId: string, input: UpdateNoteInput): Note {
  const note = getNote(userId, noteId);

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (t.length > 200) throw new ValidationError("Titre trop long (max 200 caractères)");
    note.title = t || "Sans titre";
  }
  if (input.content !== undefined) {
    if (input.content.length > 50_000) throw new ValidationError("Contenu trop long (max 50 000 caractères)");
    note.content = input.content;
  }
  if (input.pinned !== undefined) {
    note.pinned = input.pinned;
  }

  note.updatedAt = new Date().toISOString();
  persist();
  return note;
}

export function deleteNote(userId: string, noteId: string): void {
  const map = getUserNotes(userId);
  if (!map.has(noteId)) throw new NotFoundError("Note introuvable");
  map.delete(noteId);
  persist();
}

/**
 * Bulk sync for offline notes: accepts an array of { id, title, content, updatedAt }.
 * Creates or updates notes if the incoming updatedAt is newer.
 */
export function syncNotes(userId: string, incoming: Array<{ id: string; title: string; content: string; updatedAt: string; pinned?: boolean }>): Note[] {
  const map = getUserNotes(userId);
  const now = new Date().toISOString();

  for (const item of incoming) {
    const existing = map.get(item.id);
    if (existing) {
      if (new Date(item.updatedAt) > new Date(existing.updatedAt)) {
        existing.title = (item.title || "").trim().slice(0, 200) || "Sans titre";
        existing.content = (item.content || "").slice(0, 50_000);
        existing.pinned = item.pinned ?? existing.pinned;
        existing.updatedAt = item.updatedAt;
      }
    } else {
      const note: Note = {
        id: item.id,
        userId,
        title: (item.title || "").trim().slice(0, 200) || "Sans titre",
        content: (item.content || "").slice(0, 50_000),
        pinned: item.pinned ?? false,
        createdAt: item.updatedAt || now,
        updatedAt: item.updatedAt || now,
      };
      map.set(note.id, note);
    }
  }

  persist();
  return listNotes(userId);
}
