/**
 * Note Attachments Service
 *
 * Storage strategy (matches the plan):
 *   - Note WITHOUT a linked task → `notes/<noteOwnerUid>/<noteId>/<attachmentId><ext>`
 *   - Note linked to a task      → reuses the task attachment service so the file is
 *                                   visible from both the note UI and the task UI
 *
 * Access rules:
 *   - Reading: checked via `canViewNote` (note context).
 *   - Uploading/deleting: the authenticated user must be the note owner.
 *   - Storage keys are always derived server-side; never accepted from the client.
 */
import crypto from "crypto";
import path from "path";
import type { Readable } from "stream";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError, PaymentRequiredError } from "../utils/errors";
import { logger } from "../utils/logger";
import {
  addAttachment as addTaskAttachment,
  openAttachmentStream as openTaskAttachmentStream,
  listAttachments as listTaskAttachments,
  __getStorage,
} from "./attachmentService";
import { canViewNote, getNote } from "./noteService";
import { getTodoStoreOwnerId } from "./todoService";
import { findUserByUid, shouldApplyFreeTierVolumeQuotas } from "./authService";
import { FREE_QUOTA_CODE_ATTACHMENTS } from "./freeTierQuotaConstants";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_NOTE = 10;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/json",
]);

export interface NoteAttachment {
  id: string;
  noteId: string;
  /** UID of the note owner at upload time. Baked into the GCS key. */
  ownerUid: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

// ---- Persistence ----

function getNoteAttachmentStore(): Record<string, NoteAttachment[]> {
  const store = getStore();
  if (!store.noteAttachments) store.noteAttachments = {};
  return store.noteAttachments as Record<string, NoteAttachment[]>;
}

function persist(): void {
  scheduleSave("noteAttachments");
}

// ---- Helpers ----

function resolveUserEmail(uid: string): string {
  return findUserByUid(uid)?.email ?? "";
}

// ---- Public API ----

/**
 * Upload a file attachment to a note.
 *
 * If the note has a `todoId`, the file is stored under the TASK namespace
 * (delegated to `addTaskAttachment`) so it shows up in the task as well.
 * Otherwise it is stored under `notes/<ownerUid>/<noteId>/...`.
 */
export async function addNoteAttachment(
  noteId: string,
  requestingUid: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
): Promise<{ attachment: NoteAttachment | null; taskAttachmentId?: string; linkedToTaskId?: string }> {
  if (file.size > MAX_FILE_SIZE) throw new ValidationError("Fichier trop volumineux (max 5 Mo)");
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new ValidationError("Type de fichier non autorisé");

  const note = getNote(requestingUid, noteId);
  if (note.userId !== requestingUid) throw new ValidationError("Seul le propriétaire de la note peut ajouter des pièces jointes");

  // If the note is linked to a task, delegate to the task attachment service.
  if (note.todoId) {
    const ownerUid = getTodoStoreOwnerId(note.todoId);
    if (!ownerUid) throw new NotFoundError("Tâche liée introuvable");
    const taskAtt = await addTaskAttachment(note.todoId, requestingUid, ownerUid, file);
    return { attachment: null, taskAttachmentId: taskAtt.id, linkedToTaskId: note.todoId };
  }

  // Note-only path.
  if (shouldApplyFreeTierVolumeQuotas(requestingUid)) {
    throw new PaymentRequiredError(
      "Les pièces jointes sur les notes ne sont pas disponibles sur le palier gratuit. Passez à un palier payant.",
      FREE_QUOTA_CODE_ATTACHMENTS,
    );
  }
  const store = getNoteAttachmentStore();
  const list = store[noteId] ?? [];
  if (list.length >= MAX_ATTACHMENTS_PER_NOTE) {
    throw new ValidationError(`Maximum ${MAX_ATTACHMENTS_PER_NOTE} pièces jointes par note`);
  }

  const id = crypto.randomUUID();
  const ext = path.extname(path.basename(file.originalname)) || "";
  const storageKey = `notes/${requestingUid}/${noteId}/${id}${ext}`;

  const storage = __getStorage();
  await storage.save(storageKey, file.buffer, file.mimetype);

  const attachment: NoteAttachment = {
    id,
    noteId,
    ownerUid: requestingUid,
    originalName: file.originalname.replace(/[^\w.\-() ]/g, "_").substring(0, 255),
    storageKey,
    mimeType: file.mimetype,
    size: file.size,
    createdAt: new Date().toISOString(),
  };

  list.push(attachment);
  store[noteId] = list;
  persist();

  return { attachment };
}

/**
 * List attachments for a note.
 * If the note has a linkedTaskId, also returns task attachments (visible from both sides).
 */
export function listNoteAttachments(
  noteId: string,
  requestingUid: string,
): { noteAttachments: NoteAttachment[]; taskAttachments: ReturnType<typeof listTaskAttachments> } {
  const note = getNote(requestingUid, noteId);
  const email = resolveUserEmail(requestingUid);
  if (!canViewNote(requestingUid, email, noteId)) throw new ValidationError("Accès refusé");

  const noteAttachments = getNoteAttachmentStore()[noteId] ?? [];
  const taskAttachments = note.todoId ? listTaskAttachments(note.todoId) : [];
  return { noteAttachments, taskAttachments };
}

/**
 * Download a note-namespace attachment.
 * Access: any user who can view the note (owner + collaborators).
 */
export async function openNoteAttachmentStream(
  noteId: string,
  attachmentId: string,
  requestingUid: string,
): Promise<{ attachment: NoteAttachment; stream: Readable }> {
  const email = resolveUserEmail(requestingUid);
  if (!canViewNote(requestingUid, email, noteId)) throw new NotFoundError("Note introuvable");

  const list = getNoteAttachmentStore()[noteId] ?? [];
  const attachment = list.find((a) => a.id === attachmentId);
  if (!attachment) throw new NotFoundError("Pièce jointe introuvable");

  const storage = __getStorage();
  const stream = await storage.createReadStream(attachment.storageKey);
  return { attachment, stream };
}

/**
 * Delete a note-namespace attachment.
 * Only the note owner can delete.
 */
export async function deleteNoteAttachment(
  noteId: string,
  attachmentId: string,
  requestingUid: string,
): Promise<void> {
  const note = getNote(requestingUid, noteId);
  if (note.userId !== requestingUid) throw new ValidationError("Seul le propriétaire peut supprimer cette pièce jointe");

  const store = getNoteAttachmentStore();
  const list = store[noteId] ?? [];
  const idx = list.findIndex((a) => a.id === attachmentId);
  if (idx === -1) throw new NotFoundError("Pièce jointe introuvable");

  const [removed] = list.splice(idx, 1);
  store[noteId] = list;
  persist();

  const storage = __getStorage();
  try {
    await storage.delete(removed.storageKey);
  } catch (err) {
    logger.warn("[noteAttachments] delete from storage failed", {
      storageKey: removed.storageKey,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Purge all note-namespace attachments when a note is permanently deleted.
 */
export async function purgeNoteAttachments(noteId: string): Promise<void> {
  const store = getNoteAttachmentStore();
  const list = store[noteId] ?? [];
  delete store[noteId];
  persist();

  const storage = __getStorage();
  for (const att of list) {
    try {
      await storage.delete(att.storageKey);
    } catch {
      // best-effort
    }
  }
}

/**
 * Shared download helper for task attachments accessed via a note context.
 * Verifies the requestingUid can view the note AND the note's linked task matches todoId.
 */
export async function openTaskAttachmentViaNote(
  noteId: string,
  todoId: string,
  attachmentId: string,
  requestingUid: string,
): Promise<Awaited<ReturnType<typeof openTaskAttachmentStream>>> {
  const email = resolveUserEmail(requestingUid);
  if (!canViewNote(requestingUid, email, noteId)) throw new NotFoundError("Note introuvable");
  const note = getNote(requestingUid, noteId);
  // Verify the todoId matches the note's linked task to prevent cross-note bypass.
  if (note.todoId !== todoId) throw new ValidationError("Accès refusé");

  return openTaskAttachmentStream(todoId, attachmentId);
}
