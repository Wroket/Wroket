/**
 * Monday Docs → Wroket Notes sync — diff preview and apply.
 */

import crypto from "crypto";

import type { MondayDocSnapshot, MondayDocSnapshotRow } from "./mondayApiService";
import {
  findNoteByExternalId,
  listAllNotes,
  upsertNoteFromMondaySync,
  type Note,
} from "./noteService";

export type MondayDocSyncAction = "create" | "update" | "unchanged";

export interface MondayDocSyncEntityChange {
  externalId: string;
  label: string;
  action: MondayDocSyncAction;
  internalId?: string;
  changedFields?: string[];
}

export interface MondayDocSyncOrphan {
  internalId: string;
  label: string;
}

export interface MondayDocSyncDiff {
  provider: "monday";
  docs: {
    create: MondayDocSyncEntityChange[];
    update: MondayDocSyncEntityChange[];
    unchanged: number;
    orphans: MondayDocSyncOrphan[];
  };
  summary: { creates: number; updates: number; orphans: number };
}

export interface ApplyMondayDocSyncResult {
  created: number;
  updated: number;
  unchanged: number;
  orphans: number;
  notes: Note[];
}

export type MondayDocImportMode = "merge" | "create_new";

export interface MondayDocSyncOptions {
  folder?: string;
  projectId?: string | null;
  importMode?: MondayDocImportMode;
}

function docLabel(row: MondayDocSnapshotRow): string {
  return row.title?.trim() || row.externalId;
}

function noteLabel(note: Note): string {
  return note.title?.trim() || note.id;
}

function contentChanged(existing: Note, row: MondayDocSnapshotRow): boolean {
  return existing.title !== (row.title?.trim() || "Sans titre")
    || existing.content !== row.contentHtml;
}

function resolveExternalId(row: MondayDocSnapshotRow, mode: MondayDocImportMode): string {
  if (mode !== "create_new") return row.externalId;
  return `${row.externalId}:copy-${crypto.randomUUID().slice(0, 8)}`;
}

/** Computes create/update/unchanged/orphan diff for a Monday docs snapshot. */
export function computeMondayDocSyncDiff(
  ownerUid: string,
  snapshot: MondayDocSnapshot,
  opts: MondayDocSyncOptions = {},
): MondayDocSyncDiff {
  const importMode = opts.importMode ?? "merge";
  const diff: MondayDocSyncDiff = {
    provider: "monday",
    docs: { create: [], update: [], unchanged: 0, orphans: [] },
    summary: { creates: 0, updates: 0, orphans: 0 },
  };

  const snapshotIds = new Set<string>();

  for (const row of snapshot.docs) {
    const extId = resolveExternalId(row, importMode);
    snapshotIds.add(extId);
    const label = docLabel(row);
    const existing = importMode === "merge"
      ? findNoteByExternalId(ownerUid, "monday", row.externalId)
      : undefined;

    if (!existing) {
      diff.docs.create.push({ externalId: extId, label, action: "create" });
      continue;
    }
    if (!contentChanged(existing, row)) {
      diff.docs.unchanged += 1;
    } else {
      diff.docs.update.push({
        externalId: extId,
        label,
        action: "update",
        internalId: existing.id,
        changedFields: ["title", "content"],
      });
    }
  }

  if (importMode === "merge") {
    for (const note of listAllNotes(ownerUid)) {
      const ref = note.externalRef;
      if (!ref || ref.provider !== "monday") continue;
      if (ref.connectionId && ref.connectionId !== snapshot.connectionId) continue;
      if (snapshotIds.has(ref.externalId)) continue;
      diff.docs.orphans.push({ internalId: note.id, label: noteLabel(note) });
    }
  }

  diff.summary = {
    creates: diff.docs.create.length,
    updates: diff.docs.update.length,
    orphans: diff.docs.orphans.length,
  };
  return diff;
}

/** Applies Monday docs snapshot to Wroket notes (bounded mirror). */
export function applyMondayDocSyncDiff(
  ownerUid: string,
  snapshot: MondayDocSnapshot,
  opts: MondayDocSyncOptions = {},
): ApplyMondayDocSyncResult {
  const importMode = opts.importMode ?? "merge";
  const folder = opts.folder?.trim() || "Monday";
  const projectId = opts.projectId?.trim() || null;
  const result: ApplyMondayDocSyncResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    orphans: 0,
    notes: [],
  };

  for (const row of snapshot.docs) {
    const extId = resolveExternalId(row, importMode);
    const upsert = upsertNoteFromMondaySync(
      ownerUid,
      {
        externalId: extId,
        title: row.title,
        contentHtml: row.contentHtml,
        folder: importMode === "create_new" ? folder : folder,
        projectId,
      },
      { connectionId: snapshot.connectionId },
    );
    result.notes.push(upsert.note);
    if (upsert.created) {
      result.created += 1;
    } else if (upsert.changedFields.length > 0) {
      result.updated += 1;
    } else {
      result.unchanged += 1;
    }
  }

  if (importMode === "merge") {
    const diff = computeMondayDocSyncDiff(ownerUid, snapshot, opts);
    result.orphans = diff.summary.orphans;
  }

  return result;
}
