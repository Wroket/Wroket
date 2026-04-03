import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";
import { getTeam, getTeamRole } from "./teamService";

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  pinned: boolean;
  folder?: string;
  tags?: string[];
  todoId?: string;
  projectId?: string;
  shared?: boolean;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title?: string;
  content?: string;
  id?: string;
  folder?: string;
  tags?: string[];
  todoId?: string;
  projectId?: string;
  shared?: boolean;
  teamId?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  pinned?: boolean;
  folder?: string;
  tags?: string[];
  todoId?: string | null;
  projectId?: string | null;
  shared?: boolean;
  teamId?: string;
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

function validateSharing(userId: string, shared?: boolean, teamId?: string): void {
  if (shared && teamId) {
    const team = getTeam(teamId);
    if (!team) throw new ValidationError("Équipe introuvable");
    const store = getStore();
    const users = (store.users ?? {}) as Record<string, Record<string, unknown>>;
    const userEmail = (users[userId]?.email as string) ?? "";
    const role = getTeamRole(team, userId, userEmail);
    if (!role) throw new ValidationError("Vous ne faites pas partie de cette équipe");
  }
}

export function createNote(userId: string, input: CreateNoteInput): Note {
  const title = (input.title ?? "").trim();
  if (title.length > 200) throw new ValidationError("Titre trop long (max 200 caractères)");
  const content = input.content ?? "";
  if (content.length > 50_000) throw new ValidationError("Contenu trop long (max 50 000 caractères)");

  const folder = input.folder?.trim() || undefined;
  const tags = input.tags?.length ? input.tags.slice(0, 10) : undefined;
  const todoId = input.todoId?.trim() || undefined;
  const projectId = input.projectId?.trim() || undefined;
  const shared = input.shared ?? undefined;
  const teamId = input.teamId?.trim() || undefined;

  validateSharing(userId, shared, teamId);

  const now = new Date().toISOString();
  const note: Note = {
    id: crypto.randomUUID(),
    userId,
    title: title || "Sans titre",
    content,
    pinned: false,
    folder,
    tags,
    todoId,
    projectId,
    shared: shared && teamId ? true : undefined,
    teamId: shared && teamId ? teamId : undefined,
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
  if (input.folder !== undefined) {
    note.folder = input.folder.trim() || undefined;
  }
  if (input.tags !== undefined) {
    note.tags = input.tags.length ? input.tags.slice(0, 10) : undefined;
  }
  if (input.todoId !== undefined) {
    note.todoId = input.todoId?.trim() || undefined;
  }
  if (input.projectId !== undefined) {
    note.projectId = input.projectId?.trim() || undefined;
  }
  if (input.shared !== undefined || input.teamId !== undefined) {
    const wantShared = input.shared ?? note.shared;
    const wantTeamId = (input.teamId !== undefined ? input.teamId.trim() : note.teamId) || undefined;
    validateSharing(userId, wantShared, wantTeamId);
    note.shared = wantShared && wantTeamId ? true : undefined;
    note.teamId = wantShared && wantTeamId ? wantTeamId : undefined;
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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const item of incoming) {
    if (!item.id || !UUID_RE.test(item.id)) continue;
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

export function getTodoNoteMap(userId: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const note of getUserNotes(userId).values()) {
    if (note.todoId) map[note.todoId] = note.id;
  }
  return map;
}

export function listNotesByTodo(userId: string, todoId: string): Note[] {
  return Array.from(getUserNotes(userId).values())
    .filter((n) => n.todoId === todoId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Returns notes shared by other users with teams the current user belongs to. */
export function listSharedNotes(uid: string, userEmail: string): Note[] {
  const store = getStore();
  const teamStore = (store.teams ?? {}) as Record<string, Record<string, unknown>>;

  const userTeamIds: string[] = [];
  for (const [teamId, team] of Object.entries(teamStore)) {
    const members = (team.members as Array<{ email: string }>) ?? [];
    if (team.ownerUid === uid || members.some((m) => m.email === userEmail)) {
      userTeamIds.push(teamId);
    }
  }

  const noteStore = (store.notes ?? {}) as Record<string, Record<string, Note>>;
  const shared: Note[] = [];
  for (const [noteOwnerUid, userNotes] of Object.entries(noteStore)) {
    if (noteOwnerUid === uid) continue;
    for (const note of Object.values(userNotes)) {
      if (note.shared && note.teamId && userTeamIds.includes(note.teamId)) {
        shared.push(note);
      }
    }
  }

  return shared.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
