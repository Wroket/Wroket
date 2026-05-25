/**
 * One-shot migration: copy the legacy monolithic `store/activityLog` array
 * into the append-only Firestore collection `activity_log_v2`. Idempotent —
 * each entry keeps its existing `id` so re-runs upsert in place.
 *
 * Why: before May 2026 the audit log lived in a single Firestore document that
 * was rewritten on every action, which lost rows under multi-instance writes
 * (see backend/src/services/activityLogService.ts). This script seeds the new
 * collection with whatever the legacy document still contains so the admin UI
 * can read the full history from the new source going forward.
 *
 * Prerequisites:
 *   - GOOGLE_CLOUD_PROJECT set (or in backend/.env).
 *   - Application Default Credentials with Datastore/Firestore write on the
 *     target project (`gcloud auth application-default login`).
 *   - RUN_MIGRATION=activity_log_v2 to confirm intent (no silent run at boot).
 *
 * Usage:
 *   RUN_MIGRATION=activity_log_v2 npx ts-node backend/src/scripts/migrateActivityLogToCollection.ts
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { initStore } from "../persistence";
import { migrateLegacyActivityLogToCollection } from "../services/activityLogService";

async function main(): Promise<void> {
  if (process.env.RUN_MIGRATION !== "activity_log_v2") {
    console.error(
      "[activityLog-migrate] refusing to run without RUN_MIGRATION=activity_log_v2",
    );
    process.exit(2);
  }
  if (process.env.USE_LOCAL_STORE === "true") {
    console.error("[activityLog-migrate] USE_LOCAL_STORE=true: nothing to migrate");
    process.exit(2);
  }
  await initStore();
  const result = await migrateLegacyActivityLogToCollection();
  console.log(
    "[activityLog-migrate] done — legacy entries: %d, written: %d",
    result.total,
    result.written,
  );
}

main().catch((err) => {
  console.error("[activityLog-migrate] fatal:", err);
  process.exit(99);
});
