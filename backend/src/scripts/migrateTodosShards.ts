/**
 * One-shot migration: split legacy `store/todos` into `store/todos_0` … `store/todos_{N-1}`.
 *
 * Prerequisites:
 * - GOOGLE_CLOUD_PROJECT (or .env in backend/)
 * - Credentials with Firestore access (e.g. GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
 *
 * Safe to re-run: overwrites shard docs from current legacy `todos` content.
 * Does NOT delete `store/todos` (remove manually after validating prod).
 *
 * Usage:
 *   cd backend && npm run migrate:todos-shards
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { Firestore } from "@google-cloud/firestore";
import { TODO_SHARD_COUNT, todoShardDocId, todoShardIndex } from "../persistence";

type TodoBlob = Record<string, Record<string, unknown>>;

async function main(): Promise<void> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("GOOGLE_CLOUD_PROJECT is required");
    process.exit(1);
  }

  const db = new Firestore({ projectId });
  const col = db.collection("store");
  const legacyRef = col.doc("todos");
  const legacySnap = await legacyRef.get();

  if (!legacySnap.exists) {
    console.log("[migrate] No store/todos document — nothing to migrate.");
    process.exit(0);
  }

  const raw = legacySnap.data()?.data as TodoBlob | undefined;
  if (!raw || typeof raw !== "object") {
    console.log("[migrate] store/todos has no data field — exiting.");
    process.exit(0);
  }

  const userIds = Object.keys(raw);
  console.log("[migrate] Legacy todos: %d user bucket(s)", userIds.length);

  const shards: TodoBlob[] = Array.from({ length: TODO_SHARD_COUNT }, () => ({}));
  for (const userId of userIds) {
    const idx = todoShardIndex(userId);
    shards[idx][userId] = raw[userId]!;
  }

  const nonEmpty = shards.filter((s) => Object.keys(s).length > 0).length;
  console.log("[migrate] Shards with at least one user: %d / %d", nonEmpty, TODO_SHARD_COUNT);

  const batch = db.batch();
  for (let i = 0; i < TODO_SHARD_COUNT; i++) {
    const ref = col.doc(todoShardDocId(i));
    batch.set(ref, { data: shards[i] });
  }
  await batch.commit();
  console.log("[migrate] Wrote %d shard document(s) (including empty shards).", TODO_SHARD_COUNT);
  console.log("[migrate] Done. Keep store/todos until you verify the app, then delete that document if desired.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
