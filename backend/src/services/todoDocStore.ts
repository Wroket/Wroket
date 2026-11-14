type Firestore = import("@google-cloud/firestore").Firestore;

import { stripUndefinedDeep } from "../utils/firestoreSanitize";

const USE_LOCAL = process.env.USE_LOCAL_STORE === "true";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT?.trim() ?? "";
const COLLECTION = process.env.TODOS_DOC_COLLECTION?.trim() || "todos_v2";

let db: Firestore | null = null;
let initAttempted = false;

const counters = {
  write_conflict_count: 0,
  retry_success_count: 0,
  stale_write_rejected_count: 0,
};

setInterval(() => {
  if (counters.write_conflict_count === 0 && counters.retry_success_count === 0 && counters.stale_write_rejected_count === 0) {
    return;
  }
  console.log(
    "[todos-v2] metrics write_conflict_count=%d retry_success_count=%d stale_write_rejected_count=%d",
    counters.write_conflict_count,
    counters.retry_success_count,
    counters.stale_write_rejected_count,
  );
}, 5 * 60 * 1000).unref();

async function getDb(): Promise<Firestore | null> {
  if (db) return db;
  if (initAttempted) return null;
  initAttempted = true;
  if (USE_LOCAL || !PROJECT_ID) return null;
  try {
    const { Firestore: FirestoreClass } = await import("@google-cloud/firestore");
    db = new FirestoreClass({ projectId: PROJECT_ID });
    return db;
  } catch (err) {
    console.error("[todos-v2] Firestore init failed:", err);
    return null;
  }
}

export interface TodoDocWrite {
  id: string;
  ownerUid: string;
  updatedAt: string;
  [key: string]: unknown;
}

function isNewer(a: string, b: string): boolean {
  const at = new Date(a).getTime();
  const bt = new Date(b).getTime();
  if (Number.isNaN(at) || Number.isNaN(bt)) return false;
  return at > bt;
}

async function upsertWithCondition(dbConn: Firestore, todo: TodoDocWrite): Promise<void> {
  const ref = dbConn.collection(COLLECTION).doc(todo.id);
  try {
    await dbConn.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const prev = snap.data() as Record<string, unknown>;
        const prevUpdatedAt = typeof prev.updatedAt === "string" ? prev.updatedAt : "";
        if (prevUpdatedAt && isNewer(prevUpdatedAt, todo.updatedAt)) {
          counters.stale_write_rejected_count += 1;
          return;
        }
      }
      tx.set(ref, stripUndefinedDeep(todo));
    });
  } catch {
    counters.write_conflict_count += 1;
    await dbConn.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const prev = snap.data() as Record<string, unknown>;
        const prevUpdatedAt = typeof prev.updatedAt === "string" ? prev.updatedAt : "";
        if (prevUpdatedAt && isNewer(prevUpdatedAt, todo.updatedAt)) {
          counters.stale_write_rejected_count += 1;
          return;
        }
      }
      tx.set(ref, stripUndefinedDeep(todo));
    });
    counters.retry_success_count += 1;
  }
}

/**
 * Upsert a single todo document (hot path: assign / update / book).
 * Never deletes other owner documents.
 */
export async function syncTodoV2(todo: TodoDocWrite): Promise<void> {
  const dbConn = await getDb();
  if (!dbConn) return;
  await upsertWithCondition(dbConn, todo);
}

/**
 * Upsert the given todos into `todos_v2` for one owner.
 *
 * **Invariant (zero-loss):** this never deletes documents absent from `todos`.
 * Partial in-memory snapshots (lazy hydration, project-scoped cache) must not
 * erase other tasks. Removals go through {@link deleteTodosV2ByIds} or
 * {@link deleteAllTodosV2ForOwner} with explicit ids / owner scope only.
 */
export async function syncOwnerTodosV2(_ownerUid: string, todos: TodoDocWrite[]): Promise<void> {
  const dbConn = await getDb();
  if (!dbConn) return;
  for (const todo of todos) {
    await upsertWithCondition(dbConn, todo);
  }
}

/**
 * Explicit hard-delete of todos_v2 documents by id. Logs each batch for ops.
 * @param reason machine-readable cause (`explicit_ids`, `retention_purge`, `rgpd`, …)
 */
export async function deleteTodosV2ByIds(
  ids: string[],
  reason: string = "explicit_ids",
): Promise<number> {
  if (ids.length === 0) return 0;
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const unique = [...new Set(ids)];
  let deleted = 0;
  const batchSize = 500;
  let batch = dbConn.batch();
  let ops = 0;
  for (const id of unique) {
    batch.delete(dbConn.collection(COLLECTION).doc(id));
    ops++;
    deleted++;
    if (ops >= batchSize) {
      await batch.commit();
      batch = dbConn.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(
    JSON.stringify({
      event: "todos_v2.delete",
      reason,
      count: deleted,
      idsSample: unique.slice(0, 20),
    }),
  );
  return deleted;
}

export interface TodoV2Row {
  id: string;
  ownerUid: string;
  [key: string]: unknown;
}

/** Single todos_v2 document by id (cross-replica cold lookup). */
export async function getTodoV2ById(todoId: string): Promise<TodoV2Row | null> {
  const dbConn = await getDb();
  if (!dbConn) return null;
  const snap = await dbConn.collection(COLLECTION).doc(todoId).get();
  if (!snap.exists) return null;
  const row = snap.data() as Record<string, unknown>;
  const ownerUid = typeof row.ownerUid === "string" ? row.ownerUid : "";
  return { id: snap.id, ownerUid, ...row };
}

export async function listTodosV2ByOwner(ownerUid: string): Promise<TodoV2Row[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const snap = await dbConn.collection(COLLECTION).where("ownerUid", "==", ownerUid).get();
  return snap.docs.map((d) => ({ id: d.id, ownerUid, ...(d.data() as Record<string, unknown>) }));
}

/** All todos_v2 rows assigned to `assigneeUid` (cross-owner reads). */
export async function listTodosV2ByAssignedTo(assigneeUid: string): Promise<TodoV2Row[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];
  try {
    const snap = await dbConn.collection(COLLECTION).where("assignedTo", "==", assigneeUid).get();
    return snap.docs.map((d) => {
      const row = d.data() as Record<string, unknown>;
      const ownerUid = typeof row.ownerUid === "string" ? row.ownerUid : "";
      return { id: d.id, ownerUid, ...row };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("FAILED_PRECONDITION") || msg.includes("index")) {
      console.error(JSON.stringify({
        event: "todos_v2.query.index_missing",
        field: "assignedTo",
        assigneeUid,
        error: msg,
      }));
    }
    throw err;
  }
}

/** All todos_v2 rows linked to `projectId` (cross-owner project views). */
export async function listTodosV2ByProject(projectId: string): Promise<TodoV2Row[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];
  try {
    const snap = await dbConn.collection(COLLECTION).where("projectId", "==", projectId).get();
    return snap.docs.map((d) => {
      const row = d.data() as Record<string, unknown>;
      const ownerUid = typeof row.ownerUid === "string" ? row.ownerUid : "";
      return { id: d.id, ownerUid, ...row };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("FAILED_PRECONDITION") || msg.includes("index")) {
      console.error(JSON.stringify({
        event: "todos_v2.query.index_missing",
        field: "projectId",
        projectId,
        error: msg,
      }));
    }
    throw err;
  }
}

export async function countTodosV2ByOwner(): Promise<Map<string, number>> {
  const dbConn = await getDb();
  const out = new Map<string, number>();
  if (!dbConn) return out;
  const snap = await dbConn.collection(COLLECTION).get();
  for (const d of snap.docs) {
    const row = d.data() as Record<string, unknown>;
    const ownerUid = typeof row.ownerUid === "string" ? row.ownerUid : "";
    if (!ownerUid) continue;
    out.set(ownerUid, (out.get(ownerUid) ?? 0) + 1);
  }
  return out;
}

export async function loadAllTodosV2ByOwner(): Promise<Record<string, Record<string, Record<string, unknown>>>> {
  const dbConn = await getDb();
  const out: Record<string, Record<string, Record<string, unknown>>> = {};
  if (!dbConn) return out;
  const snap = await dbConn.collection(COLLECTION).get();
  for (const d of snap.docs) {
    const row = d.data() as Record<string, unknown>;
    const ownerUid = typeof row.ownerUid === "string" ? row.ownerUid : "";
    if (!ownerUid) continue;
    if (!out[ownerUid]) out[ownerUid] = {};
    out[ownerUid]![d.id] = row;
  }
  return out;
}

/** Delete all todos_v2 documents for an owner (RGPD account deletion). */
export async function deleteAllTodosV2ForOwner(ownerUid: string): Promise<number> {
  const dbConn = await getDb();
  if (!dbConn) return 0;
  const snap = await dbConn.collection(COLLECTION).where("ownerUid", "==", ownerUid).get();
  if (snap.empty) return 0;
  let deleted = 0;
  const batchSize = 500;
  let batch = dbConn.batch();
  let ops = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    ops++;
    deleted++;
    if (ops >= batchSize) {
      await batch.commit();
      batch = dbConn.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return deleted;
}
