/**
 * Persisted note folders — empty folders can exist without any note.
 * Notes still reference folders by name (`note.folder`).
 */

import { getStore, scheduleSave } from "../persistence";
import { ValidationError, NotFoundError } from "../utils/errors";
import { listNotes } from "./noteService";
import { getProjectById } from "./projectService";

export interface NoteFolder {
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Dossier créé automatiquement pour un projet (suppression manuelle interdite). */
  projectId?: string;
  /** Présent quand le dossier est dans `archivedNoteFolders` (projet archivé). */
  archivedAt?: string;
}

export interface NoteFolderSummary {
  name: string;
  createdAt: string;
  noteCount: number;
  /** True when explicitly stored (supports empty folders). */
  persisted: boolean;
  /** Projet lié si le dossier appartient à un projet actif. */
  projectId?: string;
}

const MAX_FOLDERS_PER_OWNER = 200;
const MAX_FOLDER_NAME_LEN = 80;

type FolderStore = Record<string, Record<string, NoteFolder>>;

function getFolderStore(): FolderStore {
  const store = getStore();
  if (!store.noteFolders) store.noteFolders = {};
  return store.noteFolders as FolderStore;
}

function getArchivedFolderStore(): FolderStore {
  const store = getStore();
  if (!store.archivedNoteFolders) store.archivedNoteFolders = {};
  return store.archivedNoteFolders as FolderStore;
}

function persist(): void {
  scheduleSave("noteFolders");
}

function persistArchivedFolders(): void {
  scheduleSave("archivedNoteFolders");
}

function normalizeFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new ValidationError("Nom de dossier requis");
  if (trimmed.length > MAX_FOLDER_NAME_LEN) {
    throw new ValidationError("Nom de dossier trop long");
  }
  return trimmed;
}

function resolveProjectIdForFolder(ownerUid: string, name: string, entry?: NoteFolder): string | undefined {
  if (entry?.projectId) {
    const project = getProjectById(entry.projectId);
    if (project) return entry.projectId;
  }
  for (const note of listNotes(ownerUid)) {
    if (note.folder?.trim() !== name) continue;
    const pid = note.projectId?.trim();
    if (pid && getProjectById(pid)) return pid;
  }
  return undefined;
}

function isFolderLinkedToArchivedProject(ownerUid: string, name: string, entry?: NoteFolder): boolean {
  const candidates = new Set<string>();
  if (entry?.projectId) candidates.add(entry.projectId);
  for (const note of listNotes(ownerUid)) {
    if (note.folder?.trim() !== name) continue;
    const pid = note.projectId?.trim();
    if (pid) candidates.add(pid);
  }
  for (const pid of candidates) {
    const project = getProjectById(pid);
    if (project?.status === "archived") return true;
  }
  return Boolean(getArchivedFolderStore()[ownerUid]?.[name]);
}

export function isProjectLinkedNoteFolder(ownerUid: string, rawName: string): boolean {
  const name = rawName.trim();
  if (!name) return false;
  if (getArchivedFolderStore()[ownerUid]?.[name]?.projectId) return true;
  return Boolean(resolveProjectIdForFolder(ownerUid, name, getFolderStore()[ownerUid]?.[name]));
}

export function assertNoteFolderDeletable(ownerUid: string, rawName: string): void {
  if (isProjectLinkedNoteFolder(ownerUid, rawName)) {
    throw new ValidationError(
      "Ce dossier est lié à un projet et ne peut pas être supprimé manuellement.",
      "NOTE_FOLDER_PROJECT_LINKED",
    );
  }
}

export function purgeNoteFoldersByProjectId(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  const store = getFolderStore();
  const archivedStore = getArchivedFolderStore();
  let any = false;
  for (const bucket of [store, archivedStore]) {
    for (const [ownerUid, ownerBucket] of Object.entries(bucket)) {
      let changed = false;
      for (const [name, folder] of Object.entries(ownerBucket)) {
        if (folder.projectId === pid) {
          delete ownerBucket[name];
          changed = true;
        }
      }
      if (changed) {
        any = true;
        if (Object.keys(ownerBucket).length === 0) delete bucket[ownerUid];
        else bucket[ownerUid] = ownerBucket;
      }
    }
  }
  if (any) {
    persist();
    persistArchivedFolders();
  }
}

export function archiveNoteFoldersByProjectId(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  const store = getFolderStore();
  const archivedStore = getArchivedFolderStore();
  const now = new Date().toISOString();
  let any = false;

  for (const [ownerUid, bucket] of Object.entries(store)) {
    let changed = false;
    for (const [name, folder] of Object.entries(bucket)) {
      if (folder.projectId !== pid) continue;
      const archBucket = archivedStore[ownerUid] ?? {};
      archBucket[name] = { ...folder, updatedAt: now, archivedAt: now };
      archivedStore[ownerUid] = archBucket;
      delete bucket[name];
      changed = true;
    }
    if (changed) {
      any = true;
      if (Object.keys(bucket).length === 0) delete store[ownerUid];
      else store[ownerUid] = bucket;
    }
  }

  if (any) {
    persist();
    persistArchivedFolders();
  }
}

export function restoreNoteFoldersByProjectId(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  const project = getProjectById(pid);
  if (!project || project.status !== "active") return;

  const store = getFolderStore();
  const archivedStore = getArchivedFolderStore();
  const now = new Date().toISOString();
  let any = false;

  for (const [ownerUid, bucket] of Object.entries(archivedStore)) {
    let changed = false;
    for (const [name, folder] of Object.entries(bucket)) {
      if (folder.projectId !== pid) continue;
      const activeBucket = store[ownerUid] ?? {};
      const { archivedAt: _drop, ...rest } = folder;
      activeBucket[name] = { ...rest, updatedAt: now };
      store[ownerUid] = activeBucket;
      delete bucket[name];
      changed = true;
    }
    if (changed) {
      any = true;
      if (Object.keys(bucket).length === 0) delete archivedStore[ownerUid];
      else archivedStore[ownerUid] = bucket;
    }
  }

  if (any) {
    persist();
    persistArchivedFolders();
  }
}

export function listArchivedNoteFolderSummaries(ownerUid: string): NoteFolderSummary[] {
  const archived = getArchivedFolderStore()[ownerUid] ?? {};
  return Object.keys(archived)
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => {
      const entry = archived[name];
      return {
        name,
        createdAt: entry?.createdAt ?? new Date(0).toISOString(),
        noteCount: countNotesInFolder(ownerUid, name),
        persisted: true,
        projectId: entry?.projectId,
      };
    });
}

function countNotesInFolder(ownerUid: string, folderName: string): number {
  return listNotes(ownerUid).filter((n) => n.folder?.trim() === folderName).length;
}

/** Returns folder names referenced by notes but not in the persisted store. */
function implicitFolderNames(ownerUid: string): Set<string> {
  const names = new Set<string>();
  for (const note of listNotes(ownerUid)) {
    const f = note.folder?.trim();
    if (f) names.add(f);
  }
  return names;
}

export function listNoteFolderSummaries(ownerUid: string): NoteFolderSummary[] {
  const persisted = getFolderStore()[ownerUid] ?? {};
  const implicit = implicitFolderNames(ownerUid);
  const allNames = new Set([...Object.keys(persisted), ...implicit]);

  return [...allNames]
    .filter((name) => !isFolderLinkedToArchivedProject(ownerUid, name, persisted[name]))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => {
      const entry = persisted[name];
      return {
        name,
        createdAt: entry?.createdAt ?? new Date(0).toISOString(),
        noteCount: countNotesInFolder(ownerUid, name),
        persisted: Boolean(entry),
        projectId: resolveProjectIdForFolder(ownerUid, name, entry),
      };
    });
}

export function createNoteFolder(ownerUid: string, rawName: string): NoteFolder {
  const name = normalizeFolderName(rawName);
  const store = getFolderStore();
  const bucket = store[ownerUid] ?? {};

  if (bucket[name] || implicitFolderNames(ownerUid).has(name)) {
    throw new ValidationError("Ce nom existe déjà", "NOTE_FOLDER_EXISTS");
  }
  if (Object.keys(bucket).length >= MAX_FOLDERS_PER_OWNER) {
    throw new ValidationError(`Limite de ${MAX_FOLDERS_PER_OWNER} dossiers atteinte`, "NOTE_FOLDER_QUOTA");
  }

  const now = new Date().toISOString();
  const folder: NoteFolder = { name, createdAt: now, updatedAt: now };
  bucket[name] = folder;
  store[ownerUid] = bucket;
  persist();
  return folder;
}

/** Ensures a persisted folder exists (e.g. when a note is assigned to a new folder name). */
export function ensureNoteFolder(ownerUid: string, rawName: string, projectId?: string): void {
  const name = rawName.trim();
  if (!name || name.length > MAX_FOLDER_NAME_LEN) return;

  const store = getFolderStore();
  const bucket = store[ownerUid] ?? {};
  const now = new Date().toISOString();
  const pid = projectId?.trim() || undefined;

  if (bucket[name]) {
    if (pid && !bucket[name].projectId) {
      bucket[name].projectId = pid;
      bucket[name].updatedAt = now;
      persist();
    }
    return;
  }

  bucket[name] = { name, createdAt: now, updatedAt: now, projectId: pid };
  store[ownerUid] = bucket;
  persist();
}

export function deleteNoteFolder(ownerUid: string, rawName: string): void {
  const name = normalizeFolderName(rawName);
  assertNoteFolderDeletable(ownerUid, name);
  const store = getFolderStore();
  const bucket = store[ownerUid];
  if (!bucket?.[name]) {
    throw new NotFoundError("Dossier introuvable");
  }
  delete bucket[name];
  if (Object.keys(bucket).length === 0) {
    delete store[ownerUid];
  } else {
    store[ownerUid] = bucket;
  }
  persist();
}

/** Removes persisted folder entry if present (no error when missing). */
export function removePersistedNoteFolderIfPresent(ownerUid: string, rawName: string): void {
  const name = rawName.trim();
  if (!name) return;
  assertNoteFolderDeletable(ownerUid, name);
  const store = getFolderStore();
  const bucket = store[ownerUid];
  if (!bucket?.[name]) return;
  delete bucket[name];
  if (Object.keys(bucket).length === 0) delete store[ownerUid];
  else store[ownerUid] = bucket;
  persist();
}

export function exportNoteFoldersForOwner(ownerUid: string): NoteFolder[] {
  const bucket = getFolderStore()[ownerUid] ?? {};
  return Object.values(bucket).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function purgeNoteFoldersForOwner(ownerUid: string): void {
  const store = getFolderStore();
  const archivedStore = getArchivedFolderStore();
  delete store[ownerUid];
  delete archivedStore[ownerUid];
  persist();
  persistArchivedFolders();
}
