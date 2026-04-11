/**
 * One-shot: copy non-empty todo titles from a restored Firestore database (e.g. restore-20260407)
 * into production (default) when prod title is empty — matching by stable keys (userId + todoId).
 *
 * Does not use fuzzy matching; IDs must match between restore snapshot and current prod.
 *
 * Prerequisites:
 * - GOOGLE_CLOUD_PROJECT
 * - RESTORE_DATABASE_ID (e.g. restore-20260407)
 * - Application Default Credentials with Firestore read (restore) + read/write (default)
 *
 * Usage:
 *   DRY_RUN=true npm run reconcile:todo-titles-from-restore    # log only (default)
 *   DRY_RUN=false npm run reconcile:todo-titles-from-restore   # apply
 */

import path from "path";
import dotenv from "dotenv";
import { FieldPath, Firestore } from "@google-cloud/firestore";
import { TODO_SHARD_COUNT, todoShardDocId, todoShardIndex } from "../persistence";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

type TodoBlob = Record<string, Record<string, unknown>>;

function mergeTodoUserMaps(target: TodoBlob, chunk: unknown): void {
  if (!chunk || typeof chunk !== "object") return;
  for (const [userId, todos] of Object.entries(chunk as TodoBlob)) {
    target[userId] = todos;
  }
}

async function loadTodoBlob(db: Firestore): Promise<TodoBlob> {
  const merged: TodoBlob = {};
  const shardRefs = Array.from({ length: TODO_SHARD_COUNT }, (_, i) =>
    db.collection("store").doc(todoShardDocId(i)).get()
  );
  const legacyRef = db.collection("store").doc("todos").get();
  const shardSnaps = await Promise.all(shardRefs);
  const legacySnap = await legacyRef;
  for (const snap of shardSnaps) {
    if (snap.exists) mergeTodoUserMaps(merged, snap.data()?.data);
  }
  if (
    legacySnap.exists &&
    legacySnap.data()?.data &&
    typeof legacySnap.data()!.data === "object"
  ) {
    const legacyData = legacySnap.data()!.data as TodoBlob;
    for (const [userId, todos] of Object.entries(legacyData)) {
      if (merged[userId] === undefined) merged[userId] = todos;
    }
  }
  return merged;
}

function getTrimmedTitle(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const t = (raw as Record<string, unknown>).title;
  return typeof t === "string" ? t.trim() : "";
}

function collectPatches(restore: TodoBlob, prod: TodoBlob): Array<{ userId: string; todoId: string; title: string }> {
  const out: Array<{ userId: string; todoId: string; title: string }> = [];
  for (const [userId, prodTodos] of Object.entries(prod)) {
    const restTodos = restore[userId];
    if (!restTodos) continue;
    for (const [todoId, prodRow] of Object.entries(prodTodos)) {
      if (getTrimmedTitle(prodRow)) continue;
      const restRow = restTodos[todoId];
      if (!restRow) continue;
      const title = getTrimmedTitle(restRow);
      if (!title) continue;
      out.push({ userId, todoId, title });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const restoreId = process.env.RESTORE_DATABASE_ID?.trim();
  const dryRun = process.env.DRY_RUN !== "false";

  if (!projectId) {
    console.error("GOOGLE_CLOUD_PROJECT is required");
    process.exit(1);
  }
  if (!restoreId) {
    console.error("RESTORE_DATABASE_ID is required (e.g. restore-20260407)");
    process.exit(1);
  }

  const restoreDb = new Firestore({ projectId, databaseId: restoreId });
  const prodDb = new Firestore({ projectId, databaseId: "(default)" });

  console.log("[reconcile] Loading restore DB:", restoreId);
  const restoreBlob = await loadTodoBlob(restoreDb);
  console.log("[reconcile] Loading prod DB: (default)");
  const prodBlob = await loadTodoBlob(prodDb);

  const patches = collectPatches(restoreBlob, prodBlob);
  console.log("[reconcile] Patches to apply (empty prod title, non-empty restore title):", patches.length);
  if (patches.length === 0) {
    console.log("[reconcile] Nothing to do.");
    return;
  }

  const byShard = new Map<number, typeof patches>();
  for (const p of patches) {
    const si = todoShardIndex(p.userId);
    if (!byShard.has(si)) byShard.set(si, []);
    byShard.get(si)!.push(p);
  }

  for (const [shard, list] of [...byShard.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  shard ${shard}: ${list.length} patch(es)`);
  }

  if (dryRun) {
    const preview = patches.slice(0, 20);
    console.log("[reconcile] DRY_RUN sample (first 20):");
    for (const p of preview) {
      console.log(`  ${p.userId} / ${p.todoId} -> "${p.title.slice(0, 80)}${p.title.length > 80 ? "…" : ""}"`);
    }
    console.log("[reconcile] Set DRY_RUN=false to write to prod.");
    return;
  }

  let applied = 0;
  for (const [shardIndex, shardPatches] of byShard) {
    const ref = prodDb.collection("store").doc(todoShardDocId(shardIndex));
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`[reconcile] Missing prod doc ${todoShardDocId(shardIndex)}, skipping ${shardPatches.length} patch(es)`);
      continue;
    }
    const updates: Record<string, unknown> = {};
    for (const p of shardPatches) {
      const root = snap.data() as { data?: TodoBlob } | undefined;
      const row = root?.data?.[p.userId]?.[p.todoId];
      if (!row || typeof row !== "object") {
        console.warn(`[reconcile] Skip missing row prod ${p.userId}/${p.todoId}`);
        continue;
      }
      const fp = new FieldPath("data", p.userId, p.todoId, "title");
      updates[fp.toString()] = p.title;
      applied++;
    }
    if (Object.keys(updates).length > 0) {
      await ref.update(updates);
      console.log(`[reconcile] Updated ${todoShardDocId(shardIndex)} (${Object.keys(updates).length} field(s))`);
    }
  }

  console.log("[reconcile] Done. Applied title updates:", applied);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
