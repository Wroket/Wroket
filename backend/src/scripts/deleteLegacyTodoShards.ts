/**
 * One-shot cleanup: delete the legacy `store/todos_0..127` shard documents
 * (plus the pre-shard `store/todos` legacy doc) that became orphaned after
 * the cutover to `TODOS_STORAGE_MODE=v2`.
 *
 * In v2 mode `persistTodos` no longer writes to these shards
 * (see backend/src/services/todoService.ts:342-352) and `loadFromFirestore`
 * still reads them at boot but they're always empty — wasted bandwidth.
 *
 * Why a dedicated script rather than a one-liner: we want a dry-run by
 * default (no `RUN_MIGRATION`), explicit confirmation to write, idempotent
 * re-runs, and observable output for the audit log.
 *
 * Pre-flight (mandatory):
 *   1. Take a Firestore export to GCS — see infra/firestore/README.md.
 *   2. Confirm `TODOS_STORAGE_MODE=v2` on `wroket-api` for several deploys
 *      and that the drift monitor reports `status:"ok" source:"v2"`.
 *   3. Confirm the live listener on `todos_v2` is firing
 *      (`event:"todos_v2.invalidation.received"` in Cloud Logging when 2+
 *      replicas exist).
 *
 * Prerequisites:
 *   - GOOGLE_CLOUD_PROJECT set (or in backend/.env).
 *   - Application Default Credentials with Datastore/Firestore admin on the
 *     target project (`gcloud auth application-default login`).
 *
 * Usage:
 *   # Dry-run (default): shows what would be deleted, writes nothing.
 *   npx ts-node backend/src/scripts/deleteLegacyTodoShards.ts
 *
 *   # Actually delete:
 *   RUN_MIGRATION=delete_legacy_todo_shards npx ts-node backend/src/scripts/deleteLegacyTodoShards.ts
 *
 * Rollback: restore the full pre-cleanup export with `gcloud firestore import`.
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { TODO_SHARD_COUNT, todoShardDocId } from "../persistence";

const SHARD_NAME_REGEX = /^todos(_\d+)?$/;

interface RunSummary {
  scanned: number;
  matched: string[];
  deleted: number;
  errors: Array<{ docId: string; error: string }>;
}

async function main(): Promise<void> {
  if (process.env.USE_LOCAL_STORE === "true") {
    console.error("[deleteLegacyTodoShards] USE_LOCAL_STORE=true: nothing to do");
    process.exit(2);
  }
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!projectId) {
    console.error("[deleteLegacyTodoShards] GOOGLE_CLOUD_PROJECT is required");
    process.exit(2);
  }
  const mode = (process.env.TODOS_STORAGE_MODE?.trim().toLowerCase() ?? "legacy");
  if (mode !== "v2") {
    console.error(
      "[deleteLegacyTodoShards] refusing to run when TODOS_STORAGE_MODE=%s — must be v2 (the shards are still the source of truth otherwise)",
      mode,
    );
    process.exit(2);
  }

  const dryRun = process.env.RUN_MIGRATION !== "delete_legacy_todo_shards";

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Firestore } = require("@google-cloud/firestore") as typeof import("@google-cloud/firestore");
  const db = new Firestore({ projectId });

  console.log(
    "[deleteLegacyTodoShards] %s mode | project=%s | expected shard count=%d",
    dryRun ? "DRY-RUN" : "WRITE",
    projectId,
    TODO_SHARD_COUNT,
  );

  // List every document under `store/`. We do NOT hard-code the 128 ids in
  // case a previous run with a different TODO_SHARD_COUNT left orphans.
  const storeDocs = await db.collection("store").listDocuments();
  const summary: RunSummary = { scanned: storeDocs.length, matched: [], deleted: 0, errors: [] };

  for (const ref of storeDocs) {
    if (!SHARD_NAME_REGEX.test(ref.id)) continue;
    summary.matched.push(ref.id);
  }

  console.log(
    "[deleteLegacyTodoShards] scanned %d docs in store/, %d match the shard pattern",
    summary.scanned,
    summary.matched.length,
  );

  // Sanity: warn if the current TODO_SHARD_COUNT shards aren't all listed
  // (e.g. some were already deleted in a previous partial run).
  const expectedShardIds = new Set<string>(
    Array.from({ length: TODO_SHARD_COUNT }, (_, i) => todoShardDocId(i)),
  );
  const missingExpected = [...expectedShardIds].filter((id) => !summary.matched.includes(id));
  if (missingExpected.length > 0) {
    console.log(
      "[deleteLegacyTodoShards] note: %d expected shard id(s) not in Firestore (already deleted?)",
      missingExpected.length,
    );
  }

  if (dryRun) {
    console.log("[deleteLegacyTodoShards] DRY-RUN — would delete the following docs:");
    for (const id of summary.matched) console.log("  store/%s", id);
    console.log(
      "[deleteLegacyTodoShards] to actually delete: RUN_MIGRATION=delete_legacy_todo_shards npx ts-node backend/src/scripts/deleteLegacyTodoShards.ts",
    );
    return;
  }

  // Use a batched writer (max 500 ops per batch — well under Firestore's hard limit).
  const BATCH_SIZE = 400;
  for (let i = 0; i < summary.matched.length; i += BATCH_SIZE) {
    const slice = summary.matched.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of slice) batch.delete(db.collection("store").doc(id));
    try {
      await batch.commit();
      summary.deleted += slice.length;
      console.log("[deleteLegacyTodoShards] committed batch %d-%d (%d docs)", i, i + slice.length - 1, slice.length);
    } catch (err) {
      const message = String(err);
      for (const id of slice) summary.errors.push({ docId: id, error: message });
      console.error("[deleteLegacyTodoShards] batch %d-%d failed:", i, i + slice.length - 1, err);
    }
  }

  console.log(
    "[deleteLegacyTodoShards] done — deleted=%d, errors=%d",
    summary.deleted,
    summary.errors.length,
  );
  if (summary.errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[deleteLegacyTodoShards] fatal:", err);
  process.exit(99);
});
