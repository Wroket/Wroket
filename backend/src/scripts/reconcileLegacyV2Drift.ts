/**
 * Bidirectional reconcile between the legacy todo stores and the `todos_v2`
 * Firestore collection, for a single user uid or all users.
 *
 * Why: in `TODOS_STORAGE_MODE=dual` writes go to both legacy shards and v2,
 * but the legacy shard flush is debounced. When the API instance restarts
 * before the debounce fires (Cloud Run revision swap, OOM, etc.) the row stays
 * only in `todos_v2`. Conversely, todos created before `dual` was enabled
 * never reached `todos_v2`. Both situations create drift that hides tasks
 * from the frontend or would lose history on a future cutover to v2.
 *
 * What this does (read-only by default — set RUN_MIGRATION=reconcile_legacy_v2
 * to actually mutate Firestore):
 *   1. Copy every `todos_v2` row that is missing from the user's legacy shard
 *      into `store/todos_{shard}.data.{uid}.{id}` — restores frontend
 *      visibility in dual/legacy read modes.
 *   2. Copy every legacy row (shard or single-doc) that is missing from
 *      `todos_v2` into `todos_v2/{id}` with `ownerUid`/`id`/`updatedAt` —
 *      prevents data loss on a later cutover to v2.
 *
 * Safety:
 *   - Idempotent: each write is keyed by todo id; re-runs upsert in place.
 *   - Additive only: never deletes anything in either store.
 *   - Skips the deprecated single-doc `store/todos` for writes (we read it
 *     to detect missing-in-v2 rows but only write to the shard).
 *
 * Prerequisites:
 *   - GOOGLE_CLOUD_PROJECT set (or in backend/.env).
 *   - Application Default Credentials with Datastore/Firestore read+write on
 *     the target project (`gcloud auth application-default login`).
 *   - RUN_MIGRATION=reconcile_legacy_v2 to confirm intent.
 *
 * Usage:
 *   # Dry-run (always safe):
 *   npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --uid <uid>
 *   npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --email <addr>
 *   npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --all
 *
 *   # Real write (idempotent):
 *   RUN_MIGRATION=reconcile_legacy_v2 npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --uid <uid>
 */

import path from "path";
import dotenv from "dotenv";
import { Firestore } from "@google-cloud/firestore";

import { TODO_SHARD_COUNT, todoShardDocId, todoShardIndex } from "../persistence";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

interface Args {
  uid?: string;
  email?: string;
  all: boolean;
}

const V2_COLLECTION = process.env.TODOS_DOC_COLLECTION?.trim() || "todos_v2";

function parseArgs(argv: string[]): Args {
  const out: Args = { all: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--uid") { out.uid = next; i++; }
    else if (a === "--email") { out.email = next; i++; }
    else if (a === "--all") { out.all = true; }
    else if (a === "--help" || a === "-h") {
      console.log("Usage: reconcileLegacyV2Drift --uid <uid> | --email <email> | --all  [+ RUN_MIGRATION=reconcile_legacy_v2 to write]");
      process.exit(0);
    }
  }
  return out;
}

async function resolveUid(db: Firestore, email: string): Promise<string | null> {
  const snap = await db.collection("store").doc("users").get();
  if (!snap.exists) return null;
  const data = (snap.data()?.data ?? {}) as Record<string, Record<string, unknown>>;
  const target = email.trim().toLowerCase();
  for (const [uid, user] of Object.entries(data)) {
    const e = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (e === target) return uid;
  }
  return null;
}

async function listAllUids(db: Firestore): Promise<string[]> {
  const snap = await db.collection("store").doc("users").get();
  if (!snap.exists) return [];
  const data = (snap.data()?.data ?? {}) as Record<string, unknown>;
  return Object.keys(data);
}

interface ReconcileSummary {
  uid: string;
  shardIdx: number;
  shardCount: number;
  legacyDocCount: number;
  v2Count: number;
  v2OnlyIds: string[];
  legacyOnlyIds: string[];
  writes: { intoShard: number; intoV2: number };
}

async function reconcileUser(
  db: Firestore,
  uid: string,
  writeEnabled: boolean,
): Promise<ReconcileSummary> {
  const shardIdx = todoShardIndex(uid);
  const shardDocId = todoShardDocId(shardIdx);

  const [shardSnap, legacySnap, v2Snap] = await Promise.all([
    db.collection("store").doc(shardDocId).get(),
    db.collection("store").doc("todos").get(),
    db.collection(V2_COLLECTION).where("ownerUid", "==", uid).get(),
  ]);

  const shardBucket = (shardSnap.exists ? (shardSnap.data()?.data?.[uid] ?? {}) : {}) as Record<string, Record<string, unknown>>;
  const legacyBucket = (legacySnap.exists ? (legacySnap.data()?.data?.[uid] ?? {}) : {}) as Record<string, Record<string, unknown>>;
  const v2Rows: Record<string, Record<string, unknown>> = {};
  for (const d of v2Snap.docs) v2Rows[d.id] = d.data() as Record<string, unknown>;

  // Union legacy: shard wins where both are present (shard is the live source).
  const legacyUnion: Record<string, Record<string, unknown>> = { ...legacyBucket, ...shardBucket };

  const v2OnlyIds = Object.keys(v2Rows).filter((id) => !(id in legacyUnion));
  const legacyOnlyIds = Object.keys(legacyUnion).filter((id) => !(id in v2Rows));

  const summary: ReconcileSummary = {
    uid,
    shardIdx,
    shardCount: Object.keys(shardBucket).length,
    legacyDocCount: Object.keys(legacyBucket).length,
    v2Count: Object.keys(v2Rows).length,
    v2OnlyIds,
    legacyOnlyIds,
    writes: { intoShard: 0, intoV2: 0 },
  };

  if (!writeEnabled || (v2OnlyIds.length === 0 && legacyOnlyIds.length === 0)) {
    return summary;
  }

  // 1) v2 → shard: single set with merge so we only touch the missing ids
  //    under data.{uid}, never disturbing other users or other todos.
  if (v2OnlyIds.length > 0) {
    const innerBucket: Record<string, Record<string, unknown>> = {};
    for (const id of v2OnlyIds) {
      const { ownerUid: _ou, id: _id, ...row } = v2Rows[id] as Record<string, unknown>;
      void _ou; void _id;
      innerBucket[id] = row;
    }
    await db.collection("store").doc(shardDocId).set(
      { data: { [uid]: innerBucket } },
      { merge: true },
    );
    summary.writes.intoShard = v2OnlyIds.length;
  }

  // 2) legacy → v2: per-doc upsert with required v2 schema fields.
  for (const id of legacyOnlyIds) {
    const row = legacyUnion[id];
    const updatedAt =
      (typeof row.updatedAt === "string" && row.updatedAt) ||
      (typeof row.statusChangedAt === "string" && row.statusChangedAt) ||
      (typeof row.createdAt === "string" && row.createdAt) ||
      new Date().toISOString();
    const v2Row = { ...row, id, ownerUid: uid, updatedAt };
    await db.collection(V2_COLLECTION).doc(id).set(v2Row);
    summary.writes.intoV2 += 1;
  }

  return summary;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.uid && !args.email && !args.all) {
    console.error("Missing --uid, --email or --all");
    process.exit(1);
  }
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("GOOGLE_CLOUD_PROJECT is required");
    process.exit(1);
  }
  const writeEnabled = process.env.RUN_MIGRATION === "reconcile_legacy_v2";
  console.log(`[reconcile] write mode: ${writeEnabled ? "ENABLED" : "DRY-RUN (set RUN_MIGRATION=reconcile_legacy_v2 to mutate)"}`);

  const db = new Firestore({ projectId });

  let uids: string[] = [];
  if (args.all) {
    uids = await listAllUids(db);
    console.log(`[reconcile] --all: ${uids.length} user uids loaded`);
  } else if (args.uid) {
    uids = [args.uid];
  } else if (args.email) {
    const resolved = await resolveUid(db, args.email);
    if (!resolved) {
      console.error(`[reconcile] no uid for email ${args.email}`);
      process.exit(2);
    }
    uids = [resolved];
    console.log(`[reconcile] email ${args.email} → uid ${resolved}`);
  }

  const totals = { v2Only: 0, legacyOnly: 0, intoShard: 0, intoV2: 0, usersWithDrift: 0 };
  for (const uid of uids) {
    const s = await reconcileUser(db, uid, writeEnabled);
    const drift = s.v2OnlyIds.length + s.legacyOnlyIds.length;
    if (drift > 0) totals.usersWithDrift += 1;
    totals.v2Only += s.v2OnlyIds.length;
    totals.legacyOnly += s.legacyOnlyIds.length;
    totals.intoShard += s.writes.intoShard;
    totals.intoV2 += s.writes.intoV2;
    if (drift > 0 || !args.all) {
      console.log(
        "[reconcile] uid=%s shardIdx=%d shardCount=%d legacyDocCount=%d v2Count=%d v2Only=%d legacyOnly=%d writes=(shard=%d v2=%d)",
        uid, s.shardIdx, s.shardCount, s.legacyDocCount, s.v2Count,
        s.v2OnlyIds.length, s.legacyOnlyIds.length,
        s.writes.intoShard, s.writes.intoV2,
      );
    }
  }

  console.log(
    "[reconcile] DONE — users=%d, usersWithDrift=%d, v2Only=%d, legacyOnly=%d, written intoShard=%d intoV2=%d",
    uids.length, totals.usersWithDrift, totals.v2Only, totals.legacyOnly,
    totals.intoShard, totals.intoV2,
  );

  // Silence the unused-import lint on TODO_SHARD_COUNT — keeps the named import
  // adjacent to its peers and gives any future caller a quick reference.
  void TODO_SHARD_COUNT;
}

main().catch((err) => {
  console.error("[reconcile] fatal:", err);
  process.exit(99);
});
