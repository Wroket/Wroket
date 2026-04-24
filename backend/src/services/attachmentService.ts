import crypto from "crypto";
import fs from "fs";
import { writeFile } from "fs/promises";
import path from "path";
import type { Readable } from "stream";

import { getStore, scheduleSave } from "../persistence";
import { ValidationError, NotFoundError } from "../utils/errors";
import { logger } from "../utils/logger";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_TASK = 5;
const MAX_FILENAME_LENGTH = 255;

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

type StorageBackend = "gcs" | "local";

export interface Attachment {
  id: string;
  todoId: string;
  /** UID of the user who uploaded the file (used for delete authorization). */
  userId: string;
  /** UID of the task owner at upload time; baked into the GCS key. Absent on legacy rows. */
  ownerUid?: string;
  originalName: string;
  /** Legacy local filename (pre-GCS). Still written for local backend for backward compat. */
  storedName: string;
  /**
   * Source-of-truth storage key relative to the selected backend.
   * For GCS: `attachments/<ownerUid>/<todoId>/<attachmentId><ext>`.
   * For local: same key, resolved under UPLOAD_DIR.
   * Legacy rows may omit this; we fall back to {@link storedName} + local backend.
   */
  storageKey?: string;
  /** Which storage served this blob. Omitted on legacy rows (treated as "local"). */
  storageBackend?: StorageBackend;
  mimeType: string;
  size: number;
  createdAt: string;
}

// --- Storage abstraction ---------------------------------------------------

interface AttachmentStorage {
  readonly backend: StorageBackend;
  save(key: string, buffer: Buffer, contentType: string): Promise<void>;
  createReadStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.\-() ]/g, "_")
    .substring(0, MAX_FILENAME_LENGTH);
}

function assertSafeLocalKey(key: string): string {
  const resolved = path.resolve(UPLOAD_DIR, key);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep) && resolved !== UPLOAD_DIR) {
    throw new ValidationError("Chemin de fichier invalide");
  }
  return resolved;
}

/**
 * Disk-backed storage used for local development (USE_LOCAL_STORE=true).
 * Ephemeral on Cloud Run — never select in production.
 */
class LocalAttachmentStorage implements AttachmentStorage {
  readonly backend: StorageBackend = "local";

  constructor() {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    } catch (err) {
      logger.warn("[attachments.local] cannot create UPLOAD_DIR", {
        dir: UPLOAD_DIR,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async save(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    const full = assertSafeLocalKey(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await writeFile(full, buffer);
  }

  async createReadStream(key: string): Promise<Readable> {
    const full = assertSafeLocalKey(key);
    if (!fs.existsSync(full)) throw new NotFoundError("Fichier introuvable sur le disque");
    return fs.createReadStream(full);
  }

  async delete(key: string): Promise<void> {
    const full = assertSafeLocalKey(key);
    try { fs.unlinkSync(full); } catch { /* already gone */ }
  }
}

/**
 * Google Cloud Storage-backed implementation. The bucket must be non-public:
 * uniform bucket-level access + public-access-prevention enforced, with
 * roles/storage.objectAdmin granted only to the Cloud Run service account.
 *
 * Storage keys are derived server-side (never accepted from a client) and
 * reference the true task owner so that a caller cannot forge/forge-overwrite
 * a blob belonging to another user.
 */
class GcsAttachmentStorage implements AttachmentStorage {
  readonly backend: StorageBackend = "gcs";
  private readonly bucketName: string;
  // Lazy-loaded to keep dev environments working without the GCS SDK bundled.
  private bucketPromise: Promise<import("@google-cloud/storage").Bucket> | null = null;

  constructor(bucketName: string) {
    this.bucketName = bucketName;
  }

  private async bucket(): Promise<import("@google-cloud/storage").Bucket> {
    if (!this.bucketPromise) {
      this.bucketPromise = import("@google-cloud/storage").then(({ Storage }) => {
        const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
        return storage.bucket(this.bucketName);
      });
    }
    return this.bucketPromise;
  }

  async save(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const bucket = await this.bucket();
    const file = bucket.file(key);
    // preconditionOpts ifGenerationMatch: 0 rejects the upload if an object
    // already exists at this key, preventing accidental overwrites even if a
    // key were ever guessed or collided.
    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-store" },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  }

  async createReadStream(key: string): Promise<Readable> {
    const bucket = await this.bucket();
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) throw new NotFoundError("Fichier introuvable");
    return file.createReadStream();
  }

  async delete(key: string): Promise<void> {
    const bucket = await this.bucket();
    await bucket.file(key).delete({ ignoreNotFound: true });
  }
}

function selectStorage(): AttachmentStorage {
  const mode = (process.env.ATTACHMENTS_BACKEND || "").toLowerCase();
  const useLocalStore = process.env.USE_LOCAL_STORE === "true";
  const bucket = process.env.ATTACHMENTS_BUCKET;

  const wantGcs =
    mode === "gcs" ||
    (mode === "" && !useLocalStore);

  if (wantGcs) {
    if (!bucket) {
      throw new Error(
        "ATTACHMENTS_BUCKET is required when using the GCS attachments backend"
      );
    }
    logger.info("[attachments] using GCS backend", { bucket });
    return new GcsAttachmentStorage(bucket);
  }

  logger.warn("[attachments] using LOCAL backend — ephemeral on Cloud Run", { uploadDir: UPLOAD_DIR });
  return new LocalAttachmentStorage();
}

let storageInstance: AttachmentStorage | null = null;
function getStorage(): AttachmentStorage {
  if (!storageInstance) storageInstance = selectStorage();
  return storageInstance;
}

// Exposed for tests only — resets the memoized storage so tests can inject envs.
export function __resetAttachmentStorageForTests(): void {
  storageInstance = null;
}

// --- Metadata (Firestore / local store) ------------------------------------

function getAttachmentStore(): Record<string, Attachment[]> {
  const store = getStore();
  if (!store.attachments) store.attachments = {};
  return store.attachments as Record<string, Attachment[]>;
}

function persist(): void {
  scheduleSave("attachments");
}

function effectiveBackend(att: Attachment): StorageBackend {
  return att.storageBackend ?? "local";
}

/**
 * Storage key resolver. New rows store it explicitly; legacy rows only carry
 * `storedName`, which we treat as a local-backend key.
 */
function storageKeyFor(att: Attachment): string {
  if (att.storageKey) return att.storageKey;
  return att.storedName;
}

// --- Public API ------------------------------------------------------------

export async function addAttachment(
  todoId: string,
  userId: string,
  ownerUid: string,
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
): Promise<Attachment> {
  if (!ownerUid) throw new NotFoundError("Tâche introuvable");
  if (file.size > MAX_FILE_SIZE) throw new ValidationError("Fichier trop volumineux (max 5 Mo)");
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new ValidationError("Type de fichier non autorisé");

  const store = getAttachmentStore();
  const list = store[todoId] ?? [];
  if (list.length >= MAX_ATTACHMENTS_PER_TASK)
    throw new ValidationError(`Maximum ${MAX_ATTACHMENTS_PER_TASK} pièces jointes par tâche`);

  const id = crypto.randomUUID();
  const ext = path.extname(path.basename(file.originalname)) || "";
  // Key is derived server-side from trusted values (task owner uid + todoId + generated id).
  // It is never accepted from the client, so a caller cannot target another user's path.
  const storageKey = `attachments/${ownerUid}/${todoId}/${id}${ext}`;

  const storage = getStorage();
  await storage.save(storageKey, file.buffer, file.mimetype);

  const attachment: Attachment = {
    id,
    todoId,
    userId,
    ownerUid,
    originalName: sanitizeFilename(file.originalname),
    storedName: `${id}${ext}`,
    storageKey,
    storageBackend: storage.backend,
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

/**
 * Return a read stream for the requested attachment. The lookup is strictly
 * keyed on `(todoId, attachmentId)` — an attachment id alone never resolves to
 * a file, so a caller cannot access another task's blob by swapping the path.
 */
export async function openAttachmentStream(
  todoId: string,
  attachmentId: string,
): Promise<{ attachment: Attachment; stream: Readable }> {
  const list = getAttachmentStore()[todoId] ?? [];
  const attachment = list.find((a) => a.id === attachmentId);
  if (!attachment) throw new NotFoundError("Pièce jointe introuvable");

  const backend = effectiveBackend(attachment);
  const storage = getStorage();
  // If the row was written by a different backend (legacy local row on a GCS
  // deployment), fall back to a matching transient storage rather than silently
  // 500-ing. This keeps dev-created rows readable after a switchover.
  if (backend !== storage.backend) {
    const fallback: AttachmentStorage = backend === "local"
      ? new LocalAttachmentStorage()
      : new GcsAttachmentStorage(process.env.ATTACHMENTS_BUCKET ?? "");
    const stream = await fallback.createReadStream(storageKeyFor(attachment));
    return { attachment, stream };
  }

  const stream = await storage.createReadStream(storageKeyFor(attachment));
  return { attachment, stream };
}

export async function deleteAttachment(
  todoId: string,
  attachmentId: string,
  userId: string,
): Promise<void> {
  const store = getAttachmentStore();
  const list = store[todoId] ?? [];
  const idx = list.findIndex((a) => a.id === attachmentId);
  if (idx === -1) throw new NotFoundError("Pièce jointe introuvable");
  const att = list[idx];
  if (att.userId !== userId) {
    throw new ValidationError("Seul le propriétaire peut supprimer cette pièce jointe");
  }

  const backend = effectiveBackend(att);
  const storage = backend === getStorage().backend
    ? getStorage()
    : backend === "local"
      ? new LocalAttachmentStorage()
      : new GcsAttachmentStorage(process.env.ATTACHMENTS_BUCKET ?? "");

  try {
    await storage.delete(storageKeyFor(att));
  } catch (err) {
    logger.warn("[attachments] delete failed", {
      key: storageKeyFor(att),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  list.splice(idx, 1);
  store[todoId] = list;
  persist();
}

/** Remove every attachment row and file for the given todo ids (e.g. permanent archive purge). */
export async function purgeAttachmentsForTodoIds(todoIds: string[]): Promise<void> {
  if (todoIds.length === 0) return;
  const store = getAttachmentStore();
  let changed = false;
  const deletions: Promise<unknown>[] = [];

  for (const todoId of todoIds) {
    const list = store[todoId];
    if (!list?.length) continue;
    for (const a of list) {
      const backend = effectiveBackend(a);
      const storage = backend === getStorage().backend
        ? getStorage()
        : backend === "local"
          ? new LocalAttachmentStorage()
          : new GcsAttachmentStorage(process.env.ATTACHMENTS_BUCKET ?? "");
      deletions.push(
        storage.delete(storageKeyFor(a)).catch((err) => {
          logger.warn("[attachments.purge] delete failed", {
            key: storageKeyFor(a),
            error: err instanceof Error ? err.message : String(err),
          });
        })
      );
    }
    delete store[todoId];
    changed = true;
  }

  await Promise.allSettled(deletions);
  if (changed) persist();
}
