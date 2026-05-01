type Firestore = import("@google-cloud/firestore").Firestore;

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
      tx.set(ref, todo);
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
      tx.set(ref, todo);
    });
    counters.retry_success_count += 1;
  }
}

export async function syncOwnerTodosV2(ownerUid: string, todos: TodoDocWrite[]): Promise<void> {
  const dbConn = await getDb();
  if (!dbConn) return;

  const currentIds = new Set<string>();
  for (const todo of todos) {
    currentIds.add(todo.id);
    await upsertWithCondition(dbConn, todo);
  }

  const staleSnap = await dbConn.collection(COLLECTION).where("ownerUid", "==", ownerUid).get();
  for (const doc of staleSnap.docs) {
    if (!currentIds.has(doc.id)) {
      await doc.ref.delete();
    }
  }
}

export interface TodoV2Row {
  id: string;
  ownerUid: string;
  [key: string]: unknown;
}

export async function listTodosV2ByOwner(ownerUid: string): Promise<TodoV2Row[]> {
  const dbConn = await getDb();
  if (!dbConn) return [];
  const snap = await dbConn.collection(COLLECTION).where("ownerUid", "==", ownerUid).get();
  return snap.docs.map((d) => ({ id: d.id, ownerUid, ...(d.data() as Record<string, unknown>) }));
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
