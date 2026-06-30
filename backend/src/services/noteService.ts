import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError, PaymentRequiredError } from "../utils/errors";
import { getTeam, getTeamRole } from "./teamService";
import { normalizeEmail, findUserByEmail, findUserByUid, shouldApplyFreeTierVolumeQuotas } from "./authService";
import { FREE_QUOTA_CODE_NOTES, FREE_TIER_MAX_PERSONAL_NOTES } from "./freeTierQuotaConstants";
import { ensureNoteFolder } from "./noteFolderService";
import { getProjectById } from "./projectService";
import { normalizeExternalRef, type ExternalRef, type ExternalProvider } from "./externalRef";

/** Aligné sur `noteFolderService` — nom de dossier max. */
const MAX_NOTE_FOLDER_NAME_LEN = 80;

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
  /** UID of a specific collaborator this note is directly shared with. */
  sharedWithUid?: string;
  /** Resolved email of the collaborator (stored for display, derived from sharedWithUid). */
  sharedWithEmail?: string;
  /** Owner email — populated at read time by listSharedNotes for display; not persisted. */
  ownerEmail?: string;
  /** Set when the note is in `archivedNotes` (soft delete). */
  archivedAt?: string;
  /** External source identity (Monday doc, future Notion page, …). */
  externalRef?: ExternalRef | null;
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
  /** Set to an email to share directly with one collaborator; null to remove. */
  sharedWithEmail?: string | null;
}

const notesByUser = new Map<string, Map<string, Note>>();
const archivedNotesByUser = new Map<string, Map<string, Note>>();

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

function persistArchived(): void {
  const obj: Record<string, Record<string, Note>> = {};
  archivedNotesByUser.forEach((notes, uid) => {
    obj[uid] = {};
    notes.forEach((note, id) => { obj[uid][id] = note; });
  });
  const store = getStore();
  store.archivedNotes = obj;
  scheduleSave("archivedNotes");
}

(function hydrate() {
  const store = getStore();
  if (store.notes) {
    let count = 0;
    for (const [uid, notes] of Object.entries(store.notes)) {
      const map = new Map<string, Note>();
      for (const [id, note] of Object.entries(notes as Record<string, Note>)) {
        map.set(id, { ...note, externalRef: normalizeExternalRef(note.externalRef) });
        count++;
      }
      notesByUser.set(uid, map);
    }
    console.log("[notes] %d note(s) chargée(s)", count);
  }
})();

(function hydrateArchived() {
  const store = getStore();
  if (store.archivedNotes) {
    let count = 0;
    for (const [uid, notes] of Object.entries(store.archivedNotes)) {
      const map = new Map<string, Note>();
      for (const [id, note] of Object.entries(notes as Record<string, Note>)) {
        map.set(id, note);
        count++;
      }
      archivedNotesByUser.set(uid, map);
    }
    if (count > 0) console.log("[notes] %d archived note(s) chargée(s)", count);
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

function getUserArchivedNotes(userId: string): Map<string, Note> {
  let map = archivedNotesByUser.get(userId);
  if (!map) {
    map = new Map();
    archivedNotesByUser.set(userId, map);
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

/** Notes linked to a project (wiki / docs tab). */
export function listNotesForProject(userId: string, projectId: string): Note[] {
  const pid = projectId.trim();
  if (!pid) return [];
  return listNotes(userId).filter((n) => n.projectId === pid && !n.archivedAt);
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

/** Notes without team sharing (count toward Free-tier cap). */
export function countPersonalNotesForQuota(userId: string): number {
  let n = 0;
  for (const note of getUserNotes(userId).values()) {
    if (note.teamId) continue;
    n++;
  }
  return n;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function folderNameForProjectId(projectId: string): string | undefined {
  const projectName = getProjectById(projectId)?.name?.trim();
  if (!projectName) return undefined;
  return projectName.length > MAX_NOTE_FOLDER_NAME_LEN
    ? projectName.slice(0, MAX_NOTE_FOLDER_NAME_LEN)
    : projectName;
}

/** Détache les notes d'un projet supprimé (dossier + lien projet). */
export function clearProjectNotesOrganizationGlobally(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  const now = new Date().toISOString();
  let changed = false;

  const touch = (note: Note) => {
    if (note.projectId !== pid) return;
    if (note.folder) {
      delete note.folder;
      changed = true;
    }
    note.projectId = undefined;
    note.updatedAt = now;
    changed = true;
  };

  for (const map of notesByUser.values()) {
    for (const note of map.values()) touch(note);
  }
  for (const map of archivedNotesByUser.values()) {
    for (const note of map.values()) touch(note);
  }

  if (changed) {
    persist();
    persistArchived();
  }
}

export function createNote(userId: string, input: CreateNoteInput): Note {
  const title = (input.title ?? "").trim();
  if (title.length > 200) throw new ValidationError("Titre trop long (max 200 caractères)");
  const content = input.content ?? "";
  if (content.length > 50_000) throw new ValidationError("Contenu trop long (max 50 000 caractères)");

  const todoId = input.todoId?.trim() || undefined;
  const projectId = input.projectId?.trim() || undefined;
  const shared = input.shared ?? undefined;
  const teamId = input.teamId?.trim() || undefined;

  let folder = input.folder?.trim() || undefined;
  if (!folder && projectId) {
    folder = folderNameForProjectId(projectId);
  }

  const tags = input.tags?.length ? input.tags.slice(0, 10) : undefined;

  validateSharing(userId, shared, teamId);

  // Use client-provided id when valid (prevents duplicate on offline/sync flow)
  const clientId = input.id && UUID_RE.test(input.id) ? input.id : undefined;
  // If client id already exists for this user, return existing note (idempotent create)
  if (clientId && getUserNotes(userId).has(clientId)) {
    return getUserNotes(userId).get(clientId)!;
  }
  // Same UUID was soft-deleted: allow a fresh note with that id (offline sync / recreate)
  if (clientId && getUserArchivedNotes(userId).has(clientId)) {
    getUserArchivedNotes(userId).delete(clientId);
    persistArchived();
  }

  if (!teamId && shouldApplyFreeTierVolumeQuotas(userId)) {
    if (countPersonalNotesForQuota(userId) >= FREE_TIER_MAX_PERSONAL_NOTES) {
      throw new PaymentRequiredError(
        `Le palier gratuit est limité à ${FREE_TIER_MAX_PERSONAL_NOTES} notes personnelles. Passez à un palier payant pour lever cette limite.`,
        FREE_QUOTA_CODE_NOTES,
      );
    }
  }

  const now = new Date().toISOString();
  const note: Note = {
    id: clientId ?? crypto.randomUUID(),
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
  if (folder) ensureNoteFolder(userId, folder, projectId);
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
    if (note.projectId && !note.folder && input.folder === undefined) {
      const projectFolder = folderNameForProjectId(note.projectId);
      if (projectFolder) {
        note.folder = projectFolder;
      }
    }
  }
  if (input.shared !== undefined || input.teamId !== undefined) {
    const wantShared = input.shared ?? note.shared;
    const wantTeamId = (input.teamId !== undefined ? input.teamId.trim() : note.teamId) || undefined;
    validateSharing(userId, wantShared, wantTeamId);
    note.shared = wantShared && wantTeamId ? true : undefined;
    note.teamId = wantShared && wantTeamId ? wantTeamId : undefined;
    // Team share is mutually exclusive with individual share
    if (note.shared) {
      note.sharedWithUid = undefined;
      note.sharedWithEmail = undefined;
    }
  }

  if (input.sharedWithEmail !== undefined) {
    if (input.sharedWithEmail === null || input.sharedWithEmail.trim() === "") {
      note.sharedWithUid = undefined;
      note.sharedWithEmail = undefined;
    } else {
      const target = findUserByEmail(input.sharedWithEmail);
      if (!target) throw new ValidationError("Utilisateur introuvable");
      note.sharedWithUid = target.uid;
      note.sharedWithEmail = normalizeEmail(input.sharedWithEmail);
      // Individual share is mutually exclusive with team share
      note.shared = undefined;
      note.teamId = undefined;
    }
  }

  note.updatedAt = new Date().toISOString();
  persist();
  if (note.folder) {
    ensureNoteFolder(userId, note.folder, note.projectId);
  }
  return note;
}

/** Soft-delete: moves the note to `archivedNotes` (Firestore: `store/archivedNotes`). */
export function deleteNote(userId: string, noteId: string): void {
  const map = getUserNotes(userId);
  const note = map.get(noteId);
  if (!note) throw new NotFoundError("Note introuvable");
  const now = new Date().toISOString();
  map.delete(noteId);
  const archived: Note = { ...note, archivedAt: now, updatedAt: now };
  getUserArchivedNotes(userId).set(noteId, archived);
  persist();
  persistArchived();
}

export function listArchivedNotes(userId: string): Note[] {
  const notes = Array.from(getUserArchivedNotes(userId).values());
  return notes.sort(
    (a, b) =>
      new Date(b.archivedAt ?? b.updatedAt).getTime() - new Date(a.archivedAt ?? a.updatedAt).getTime(),
  );
}

export function restoreArchivedNote(userId: string, noteId: string): Note {
  const arch = getUserArchivedNotes(userId);
  const note = arch.get(noteId);
  if (!note) throw new NotFoundError("Note introuvable");
  arch.delete(noteId);
  const now = new Date().toISOString();
  const restored: Note = { ...note, archivedAt: undefined, updatedAt: now };
  getUserNotes(userId).set(noteId, restored);
  persist();
  persistArchived();
  return restored;
}

export function permanentlyDeleteArchivedNote(userId: string, noteId: string): void {
  const arch = getUserArchivedNotes(userId);
  if (!arch.has(noteId)) throw new NotFoundError("Note introuvable");
  arch.delete(noteId);
  persistArchived();
}

/**
 * Bulk sync for offline notes: accepts an array of { id, title, content, updatedAt }.
 * Creates or updates notes if the incoming updatedAt is newer.
 */
export function syncNotes(
  userId: string,
  incoming: Array<{ id: string; title: string; content: string; updatedAt: string; pinned?: boolean; folder?: string }>,
): Note[] {
  const map = getUserNotes(userId);
  const now = new Date().toISOString();

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let newNotesAdded = 0;

  for (const item of incoming) {
    if (!item.id || !UUID_RE.test(item.id)) continue;
    const existing = map.get(item.id);
    if (existing) {
      if (new Date(item.updatedAt) > new Date(existing.updatedAt)) {
        existing.title = (item.title || "").trim().slice(0, 200) || "Sans titre";
        existing.content = (item.content || "").slice(0, 50_000);
        existing.pinned = item.pinned ?? existing.pinned;
        existing.updatedAt = item.updatedAt;
        if (item.folder !== undefined) {
          existing.folder = item.folder.trim() || undefined;
        }
      }
    } else {
      if (getUserArchivedNotes(userId).has(item.id)) {
        continue;
      }
      if (shouldApplyFreeTierVolumeQuotas(userId)) {
        const projected = countPersonalNotesForQuota(userId) + newNotesAdded;
        if (projected >= FREE_TIER_MAX_PERSONAL_NOTES) {
          throw new PaymentRequiredError(
            `Le palier gratuit est limité à ${FREE_TIER_MAX_PERSONAL_NOTES} notes personnelles. Passez à un palier payant pour lever cette limite.`,
            FREE_QUOTA_CODE_NOTES,
          );
        }
      }
      const folderTrim = item.folder?.trim() || undefined;
      const note: Note = {
        id: item.id,
        userId,
        title: (item.title || "").trim().slice(0, 200) || "Sans titre",
        content: (item.content || "").slice(0, 50_000),
        pinned: item.pinned ?? false,
        folder: folderTrim,
        createdAt: item.updatedAt || now,
        updatedAt: item.updatedAt || now,
      };
      map.set(note.id, note);
      newNotesAdded += 1;
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

/** Unlink notes from tasks that are permanently removed (keeps note content in the library). */
export function detachNotesFromTodoIds(userId: string, todoIds: ReadonlySet<string>): void {
  if (todoIds.size === 0) return;
  const map = getUserNotes(userId);
  let changed = false;
  const now = new Date().toISOString();
  for (const note of map.values()) {
    if (note.todoId && todoIds.has(note.todoId)) {
      note.todoId = undefined;
      note.updatedAt = now;
      changed = true;
    }
  }
  if (changed) persist();
}

/** Returns notes shared with the current user (via team or direct collaborator share). */
export function listSharedNotes(uid: string, userEmail: string): Note[] {
  const store = getStore();
  const teamStore = (store.teams ?? {}) as Record<string, Record<string, unknown>>;
  const normEmail = normalizeEmail(userEmail);

  const userTeamIds: string[] = [];
  for (const [teamId, team] of Object.entries(teamStore)) {
    const members = (team.members as Array<{ email: string }>) ?? [];
    if (
      team.ownerUid === uid ||
      members.some((m) => normalizeEmail(m.email) === normEmail)
    ) {
      userTeamIds.push(teamId);
    }
  }

  const noteStore = (store.notes ?? {}) as Record<string, Record<string, Note>>;
  const shared: Note[] = [];
  for (const [noteOwnerUid, userNotes] of Object.entries(noteStore)) {
    if (noteOwnerUid === uid) continue;
    const ownerEmail = findUserByUid(noteOwnerUid)?.email ?? noteOwnerUid;
    for (const note of Object.values(userNotes)) {
      const teamShared = note.shared && note.teamId && userTeamIds.includes(note.teamId);
      const directShared = note.sharedWithUid === uid;
      if (teamShared || directShared) {
        // ownerEmail is a display-only field, not persisted
        shared.push({ ...note, ownerEmail });
      }
    }
  }

  return shared.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Auto-share a note with a collaborator when they are @mentioned.
 * No-op if the note already has a team share or individual share set.
 */
export function shareNoteWithUser(
  ownerUid: string,
  noteId: string,
  recipientUid: string,
  recipientEmail: string,
): void {
  const note = getUserNotes(ownerUid).get(noteId);
  if (!note) return;
  if (note.shared || note.sharedWithUid) return; // Don't override existing sharing
  note.sharedWithUid = recipientUid;
  note.sharedWithEmail = normalizeEmail(recipientEmail);
  note.updatedAt = new Date().toISOString();
  persist();
}

/** Returns true if the user can view the note (own or shared). */
export function canViewNote(uid: string, userEmail: string, noteId: string): boolean {
  if (getUserNotes(uid).has(noteId)) return true;
  const sharedNotes = listSharedNotes(uid, userEmail);
  return sharedNotes.some((n) => n.id === noteId);
}

/** Remove in-memory notes for a user (RGPD delete). Returns note ids purged. */
export function purgeNotesRuntimeForUid(uid: string): string[] {
  const active = notesByUser.get(uid);
  const archived = archivedNotesByUser.get(uid);
  const ids = new Set<string>([
    ...(active ? [...active.keys()] : []),
    ...(archived ? [...archived.keys()] : []),
  ]);
  notesByUser.delete(uid);
  archivedNotesByUser.delete(uid);
  return [...ids];
}

/** All active notes for owner (sync internal — no list cap). */
export function listAllNotes(userId: string): Note[] {
  return Array.from(getUserNotes(userId).values()).filter((n) => !n.archivedAt);
}

export function findNoteByExternalId(
  userId: string,
  provider: ExternalProvider,
  externalId: string,
): Note | undefined {
  return listAllNotes(userId).find(
    (n) => n.externalRef?.provider === provider && n.externalRef.externalId === externalId,
  );
}

export interface MondayDocSyncRowInput {
  externalId: string;
  title: string;
  contentHtml: string;
  folder?: string;
  projectId?: string | null;
}

export interface UpsertNoteFromMondaySyncResult {
  note: Note;
  created: boolean;
  changedFields: string[];
}

/** Upserts one note from a Monday doc pull (bounded mirror: title + content). */
export function upsertNoteFromMondaySync(
  userId: string,
  row: MondayDocSyncRowInput,
  refs: { connectionId: string },
): UpsertNoteFromMondaySyncResult {
  const title = (row.title ?? "").trim() || "Sans titre";
  if (title.length > 200) throw new ValidationError("Titre trop long (max 200 caractères)");
  const content = row.contentHtml ?? "";
  if (content.length > 50_000) {
    throw new ValidationError("Contenu trop long (max 50 000 caractères) — document Monday trop volumineux");
  }

  const now = new Date().toISOString();
  const externalRef: ExternalRef = {
    provider: "monday",
    externalId: row.externalId,
    connectionId: refs.connectionId,
    lastSyncedAt: now,
  };

  const existing = findNoteByExternalId(userId, "monday", row.externalId);
  if (existing) {
    const changedFields: string[] = [];
    if (existing.title !== title) changedFields.push("title");
    if (existing.content !== content) changedFields.push("content");
    if (changedFields.length > 0) {
      existing.title = title;
      existing.content = content;
      existing.updatedAt = now;
    }
    existing.externalRef = externalRef;
    persist();
    return { note: existing, created: false, changedFields };
  }

  const folder = row.folder?.trim() || undefined;
  const projectId = row.projectId?.trim() || undefined;

  if (!row.projectId && shouldApplyFreeTierVolumeQuotas(userId)) {
    if (countPersonalNotesForQuota(userId) >= FREE_TIER_MAX_PERSONAL_NOTES) {
      throw new PaymentRequiredError(
        `Le palier gratuit est limité à ${FREE_TIER_MAX_PERSONAL_NOTES} notes personnelles. Passez à un palier payant pour lever cette limite.`,
        FREE_QUOTA_CODE_NOTES,
      );
    }
  }

  const note: Note = {
    id: crypto.randomUUID(),
    userId,
    title,
    content,
    pinned: false,
    folder,
    projectId,
    externalRef,
    createdAt: now,
    updatedAt: now,
  };

  getUserNotes(userId).set(note.id, note);
  persist();
  if (folder) ensureNoteFolder(userId, folder, projectId);
  return { note, created: true, changedFields: ["title", "content"] };
}
