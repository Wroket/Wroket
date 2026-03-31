import crypto from "crypto";
import fs from "fs";
import path from "path";

import { getStore, scheduleSave } from "../persistence";
import { ValidationError, NotFoundError } from "../utils/errors";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ATTACHMENTS_PER_TASK = 5;
const MAX_FILENAME_LENGTH = 255;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/json",
]);

export interface Attachment {
  id: string;
  todoId: string;
  userId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

function getAttachmentStore(): Record<string, Attachment[]> {
  const store = getStore();
  if (!store.attachments) store.attachments = {};
  return store.attachments as Record<string, Attachment[]>;
}

function persist(): void {
  scheduleSave("attachments");
}

try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.\-() ]/g, "_")
    .substring(0, MAX_FILENAME_LENGTH);
}

function resolveAndGuard(fileName: string): string {
  const resolved = path.resolve(UPLOAD_DIR, fileName);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
    throw new ValidationError("Chemin de fichier invalide");
  }
  return resolved;
}

export function addAttachment(
  todoId: string,
  userId: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
): Attachment {
  if (file.size > MAX_FILE_SIZE) throw new ValidationError("Fichier trop volumineux (max 5 Mo)");
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new ValidationError("Type de fichier non autorisé");

  const store = getAttachmentStore();
  const list = store[todoId] ?? [];
  if (list.length >= MAX_ATTACHMENTS_PER_TASK)
    throw new ValidationError(`Maximum ${MAX_ATTACHMENTS_PER_TASK} pièces jointes par tâche`);

  const ext = path.extname(path.basename(file.originalname)) || "";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const filePath = resolveAndGuard(storedName);

  fs.writeFileSync(filePath, file.buffer);

  const attachment: Attachment = {
    id: crypto.randomUUID(),
    todoId,
    userId,
    originalName: sanitizeFilename(file.originalname),
    storedName,
    mimeType: file.mimetype,
    size: file.size,
    createdAt: new Date().toISOString(),
  };

  list.push(attachment);
  store[todoId] = list;
  persist();
  return attachment;
}

export function listAttachments(todoId: string): Attachment[] {
  return getAttachmentStore()[todoId] ?? [];
}

export function getAttachmentFile(
  todoId: string,
  attachmentId: string,
): { attachment: Attachment; filePath: string } {
  const list = getAttachmentStore()[todoId] ?? [];
  const attachment = list.find((a) => a.id === attachmentId);
  if (!attachment) throw new NotFoundError("Pièce jointe introuvable");
  const filePath = resolveAndGuard(attachment.storedName);
  if (!fs.existsSync(filePath)) throw new NotFoundError("Fichier introuvable sur le disque");
  return { attachment, filePath };
}

export function deleteAttachment(todoId: string, attachmentId: string, userId: string): void {
  const store = getAttachmentStore();
  const list = store[todoId] ?? [];
  const idx = list.findIndex((a) => a.id === attachmentId);
  if (idx === -1) throw new NotFoundError("Pièce jointe introuvable");
  if (list[idx].userId !== userId)
    throw new ValidationError("Seul le propriétaire peut supprimer cette pièce jointe");

  const filePath = resolveAndGuard(list[idx].storedName);
  try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }

  list.splice(idx, 1);
  store[todoId] = list;
  persist();
}
