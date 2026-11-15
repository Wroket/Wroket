/**
 * Ring buffer of the last N content snapshots for notes and user-databases.
 */

import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";
import type { Note } from "./noteService";
import type { DatabaseColumnDef, DatabaseRow, UserDatabase } from "./userDatabaseService";

export const MAX_REVISIONS = 5;

export interface NoteRevisionSnapshot {
  title: string;
  content: string;
  blocks: Note["blocks"];
}

export interface DatabaseRevisionSnapshot {
  name: string;
  columns: DatabaseColumnDef[];
  defaultView: "table" | "board";
  boardGroupColumnId: string | null;
  rows: DatabaseRow[];
}

export interface ContentRevision<T> {
  id: string;
  at: string;
  byUid: string;
  byEmail?: string;
  snapshot: T;
}

function getNoteRevisionStore(): Record<string, ContentRevision<NoteRevisionSnapshot>[]> {
  const store = getStore();
  if (!store.noteRevisions) store.noteRevisions = {};
  return store.noteRevisions as Record<string, ContentRevision<NoteRevisionSnapshot>[]>;
}

function getDatabaseRevisionStore(): Record<string, ContentRevision<DatabaseRevisionSnapshot>[]> {
  const store = getStore();
  if (!store.databaseRevisions) store.databaseRevisions = {};
  return store.databaseRevisions as Record<string, ContentRevision<DatabaseRevisionSnapshot>[]>;
}

function pushRing<T>(
  map: Record<string, ContentRevision<T>[]>,
  entityId: string,
  entry: ContentRevision<T>,
  persistDomain: "noteRevisions" | "databaseRevisions",
): void {
  const list = map[entityId] ?? [];
  const next = [entry, ...list].slice(0, MAX_REVISIONS);
  map[entityId] = next;
  scheduleSave(persistDomain);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export function pushNoteRevision(
  noteId: string,
  snapshot: NoteRevisionSnapshot,
  byUid: string,
  byEmail?: string,
): ContentRevision<NoteRevisionSnapshot> | null {
  const map = getNoteRevisionStore();
  const latest = map[noteId]?.[0];
  if (latest && stableJson(latest.snapshot) === stableJson(snapshot)) return null;
  const entry: ContentRevision<NoteRevisionSnapshot> = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    byUid,
    byEmail,
    snapshot: {
      title: snapshot.title,
      content: snapshot.content,
      blocks: snapshot.blocks ? structuredClone(snapshot.blocks) : snapshot.blocks,
    },
  };
  pushRing(map, noteId, entry, "noteRevisions");
  return entry;
}

export function listNoteRevisions(noteId: string): ContentRevision<NoteRevisionSnapshot>[] {
  return (getNoteRevisionStore()[noteId] ?? []).slice();
}

export function getNoteRevision(
  noteId: string,
  revId: string,
): ContentRevision<NoteRevisionSnapshot> {
  const rev = listNoteRevisions(noteId).find((r) => r.id === revId);
  if (!rev) throw new NotFoundError("Révision introuvable");
  return rev;
}

export function pushDatabaseRevision(
  databaseId: string,
  snapshot: DatabaseRevisionSnapshot,
  byUid: string,
  byEmail?: string,
): ContentRevision<DatabaseRevisionSnapshot> | null {
  const map = getDatabaseRevisionStore();
  const latest = map[databaseId]?.[0];
  if (latest && stableJson(latest.snapshot) === stableJson(snapshot)) return null;
  const entry: ContentRevision<DatabaseRevisionSnapshot> = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    byUid,
    byEmail,
    snapshot: {
      name: snapshot.name,
      columns: structuredClone(snapshot.columns),
      defaultView: snapshot.defaultView,
      boardGroupColumnId: snapshot.boardGroupColumnId,
      rows: structuredClone(snapshot.rows),
    },
  };
  pushRing(map, databaseId, entry, "databaseRevisions");
  return entry;
}

export function listDatabaseRevisions(
  databaseId: string,
): ContentRevision<DatabaseRevisionSnapshot>[] {
  return (getDatabaseRevisionStore()[databaseId] ?? []).slice();
}

export function getDatabaseRevision(
  databaseId: string,
  revId: string,
): ContentRevision<DatabaseRevisionSnapshot> {
  const rev = listDatabaseRevisions(databaseId).find((r) => r.id === revId);
  if (!rev) throw new NotFoundError("Révision introuvable");
  return rev;
}

export function snapshotFromNote(note: Pick<Note, "title" | "content" | "blocks">): NoteRevisionSnapshot {
  return {
    title: note.title,
    content: note.content,
    blocks: note.blocks,
  };
}

export function snapshotFromDatabase(
  database: UserDatabase,
  rows: DatabaseRow[],
): DatabaseRevisionSnapshot {
  return {
    name: database.name,
    columns: database.columns,
    defaultView: database.defaultView,
    boardGroupColumnId: database.boardGroupColumnId,
    rows,
  };
}

/** Apply snapshot rows into the live row store (caller persists DB meta separately). */
export function replaceDatabaseRows(databaseId: string, rows: DatabaseRow[]): void {
  const store = getStore();
  if (!store.userDatabaseRows) store.userDatabaseRows = {};
  (store.userDatabaseRows as Record<string, DatabaseRow[]>)[databaseId] = rows.map((r) => ({
    ...r,
    databaseId,
  }));
  scheduleSave("userDatabaseRows");
}

export function assertRevisionActor(canWrite: boolean): void {
  if (!canWrite) throw new ValidationError("Lecture seule — restauration impossible");
}
