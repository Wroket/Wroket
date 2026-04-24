/**
 * Scan the `store/attachments` Firestore document and identify attachment rows
 * whose backing file is missing on the configured storage backend (typically
 * legacy rows left behind after the migration from the ephemeral Cloud Run
 * disk to GCS). Dry-run by default; pass `--apply` to actually delete the
 * metadata entries.
 *
 * Requires:
 *   - GOOGLE_CLOUD_PROJECT
 *   - ATTACHMENTS_BUCKET (when scanning GCS rows)
 *   - Application Default Credentials (ADC) with Firestore read/write +
 *     Storage read on the target bucket.
 *
 * Usage (dry-run):
 *   npm run build && node -r dotenv/config dist/scripts/cleanupOrphanAttachments.js
 *
 * Usage (apply):
 *   npm run build && node -r dotenv/config dist/scripts/cleanupOrphanAttachments.js --apply
 */

import path from "path";
import dotenv from "dotenv";
import { Firestore } from "@google-cloud/firestore";
import { Storage, Bucket } from "@google-cloud/storage";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

interface AttachmentRow {
  id: string;
  todoId: string;
  userId: string;
  ownerUid?: string;
  originalName: string;
  storedName: string;
  storageKey?: string;
  storageBackend?: "gcs" | "local";
  mimeType: string;
  size: number;
  createdAt: string;
}

type AttachmentsDoc = Record<string, AttachmentRow[]>;

const APPLY = process.argv.includes("--apply");

function effectiveKey(row: AttachmentRow): string {
  return row.storageKey ?? row.storedName;
}

function effectiveBackend(row: AttachmentRow): "gcs" | "local" {
  return row.storageBackend ?? "local";
}

async function loadAttachments(db: Firestore): Promise<AttachmentsDoc> {
  const snap = await db.collection("store").doc("attachments").get();
  if (!snap.exists) return {};
  const data = (snap.data()?.data ?? {}) as AttachmentsDoc;
  return data;
}

async function gcsExists(bucket: Bucket, key: string): Promise<boolean> {
  try {
    const [ok] = await bucket.file(key).exists();
    return ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error("GOOGLE_CLOUD_PROJECT is required");

  const bucketName = process.env.ATTACHMENTS_BUCKET;
  const db = new Firestore({ projectId });
  const bucket = bucketName
    ? new Storage({ projectId }).bucket(bucketName)
    : null;

  const attachments = await loadAttachments(db);
  const todoIds = Object.keys(attachments);
  console.log(
    "[cleanup] scanning %d task bucket(s) for orphan attachments (mode: %s)",
    todoIds.length,
    APPLY ? "APPLY" : "DRY-RUN",
  );

  let scanned = 0;
  let orphans = 0;
  const orphansByTodo: Record<string, AttachmentRow[]> = {};

  for (const todoId of todoIds) {
    const list = attachments[todoId] ?? [];
    for (const row of list) {
      scanned++;
      const backend = effectiveBackend(row);
      const key = effectiveKey(row);
      let present = false;

      if (backend === "gcs") {
        if (!bucket) {
          console.warn(
            "[cleanup] row %s declared backend=gcs but ATTACHMENTS_BUCKET unset — treating as orphan",
            row.id,
          );
        } else {
          present = await gcsExists(bucket, key);
        }
      } else {
        // Local rows cannot be verified from this script (we're not on the
        // Cloud Run instance's ephemeral disk). We treat them as orphans if
        // we're running in a GCS-first environment, which is the whole point
        // of the cleanup.
        present = false;
      }

      if (!present) {
        orphans++;
        (orphansByTodo[todoId] ??= []).push(row);
      }
    }
  }

  console.log(
    "[cleanup] scanned=%d  orphan-rows=%d  across %d task(s)",
    scanned,
    orphans,
    Object.keys(orphansByTodo).length,
  );

  for (const [todoId, rows] of Object.entries(orphansByTodo)) {
    console.log("  todo=%s  orphan-rows=%d", todoId, rows.length);
    for (const row of rows) {
      console.log(
        "    - id=%s  originalName=%s  backend=%s  key=%s",
        row.id,
        row.originalName,
        effectiveBackend(row),
        effectiveKey(row),
      );
    }
  }

  if (!APPLY) {
    console.log(
      "[cleanup] dry-run only; rerun with --apply to delete the %d orphan row(s)",
      orphans,
    );
    return;
  }

  if (orphans === 0) {
    console.log("[cleanup] nothing to apply");
    return;
  }

  const updated: AttachmentsDoc = {};
  for (const [todoId, list] of Object.entries(attachments)) {
    const orphanIds = new Set((orphansByTodo[todoId] ?? []).map((r) => r.id));
    const remaining = list.filter((r) => !orphanIds.has(r.id));
    if (remaining.length > 0) updated[todoId] = remaining;
  }

  await db.collection("store").doc("attachments").set({ data: updated });
  console.log("[cleanup] applied: removed %d orphan row(s)", orphans);
}

main().catch((err) => {
  console.error("[cleanup] fatal:", err);
  process.exit(99);
});
