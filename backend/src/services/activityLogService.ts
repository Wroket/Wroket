import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { stripUndefinedDeep } from "../utils/firestoreSanitize";

type Firestore = import("@google-cloud/firestore").Firestore;

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Append-only audit log.
 *
 * History: before May 2026 the log was stored as a single Firestore document
 * (`store/activityLog`) rewritten on every action. A multi-instance race could
 * overwrite the entire array with a stale snapshot, producing date-bounded gaps
 * (e.g. nothing between 2026-05-13 and 2026-05-22). The current design writes
 * each entry as its own document in `activity_log_v2/{id}` so concurrent writes
 * no longer fight on the same doc. The legacy in-memory array is kept as a hot
 * cache that backs reads when Firestore is unavailable (USE_LOCAL_STORE=true,
 * init failure, etc.) so behaviour stays identical in dev and tests.
 */

const MAX_ENTRIES = 10_000;
const COLLECTION = process.env.ACTIVITY_LOG_COLLECTION?.trim() || "activity_log_v2";
const USE_LOCAL = process.env.USE_LOCAL_STORE === "true";

const activityLog: ActivityLogEntry[] = [];

let db: Firestore | null = null;
let dbInitAttempted = false;
let dbInitPromise: Promise<Firestore | null> | null = null;

async function getDb(): Promise<Firestore | null> {
  if (db) return db;
  if (USE_LOCAL) return null;
  if (!process.env.GOOGLE_CLOUD_PROJECT?.trim()) return null;
  if (dbInitPromise) return dbInitPromise;
  if (dbInitAttempted) return null;
  dbInitAttempted = true;
  dbInitPromise = (async () => {
    try {
      const { Firestore: FirestoreClass } = await import("@google-cloud/firestore");
      db = new FirestoreClass({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
      return db;
    } catch (err) {
      console.error("[activityLog] Firestore init failed:", err);
      return null;
    }
  })();
  return dbInitPromise;
}

function persistInMemoryToLegacyDoc(): void {
  const store = getStore();
  store.activityLog = activityLog;
  // Prod source of truth is `activity_log_v2` (one doc per entry). Rewriting the
  // monolithic `store/activityLog` doc on every action exceeds Firestore's 1 MiB
  // limit and blocks the entire store flush (users, sessions, projects, …).
  if (USE_LOCAL) {
    scheduleSave("activityLog");
  }
}

(function hydrate() {
  const store = getStore();
  if (store.activityLog) {
    activityLog.push(...(store.activityLog as ActivityLogEntry[]));
    console.log("[activityLog] chargées : %d entrée(s)", activityLog.length);
  }
})();

/**
 * Append-only write: fire-and-forget to Firestore + keep in-memory cache up to
 * `MAX_ENTRIES`. The caller never awaits — audit must not block business logic.
 */
export function logActivity(
  userId: string,
  userEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
): void {
  const entry: ActivityLogEntry = {
    id: crypto.randomUUID(),
    userId,
    userEmail,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_ENTRIES) activityLog.length = MAX_ENTRIES;
  persistInMemoryToLegacyDoc();

  void appendToFirestore(entry).catch((err) => {
    console.warn("[activityLog] firestore append failed (kept in memory only): %s", err);
  });
}

async function appendToFirestore(entry: ActivityLogEntry): Promise<void> {
  const dbConn = await getDb();
  if (!dbConn) return;
  await dbConn.collection(COLLECTION).doc(entry.id).set(stripUndefinedDeep(entry));
}

interface ActivityLogFilters {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
  offset?: number;
  /** ISO timestamp — keep entries with createdAt >= this instant (rolling window). */
  since?: string;
}

function filterInMemory(filters?: ActivityLogFilters): ActivityLogEntry[] {
  let out = activityLog;
  if (filters?.userId) out = out.filter((e) => e.userId === filters.userId);
  if (filters?.entityType) out = out.filter((e) => e.entityType === filters.entityType);
  if (filters?.entityId) out = out.filter((e) => e.entityId === filters.entityId);
  if (filters?.action) out = out.filter((e) => e.action === filters.action);
  if (filters?.since) {
    const sinceMs = new Date(filters.since).getTime();
    if (!Number.isNaN(sinceMs)) {
      out = out.filter((e) => new Date(e.createdAt).getTime() >= sinceMs);
    }
  }
  return out;
}

/**
 * Read from Firestore when available (single source of truth in prod) and fall
 * back to the in-memory cache otherwise. Firestore queries combine at most one
 * `where` plus `orderBy(createdAt desc)` to avoid composite-index requirements
 * for the common cases; extra predicates are applied client-side.
 */
async function readFromFirestoreOrMemory(filters?: ActivityLogFilters): Promise<ActivityLogEntry[]> {
  const dbConn = await getDb();
  if (!dbConn) return filterInMemory(filters);
  try {
    let q: FirebaseFirestore.Query = dbConn.collection(COLLECTION);
    if (filters?.userId) q = q.where("userId", "==", filters.userId);
    else if (filters?.entityId) q = q.where("entityId", "==", filters.entityId);
    // Avoid composite indexes (userId/entityId + orderBy createdAt) — sort in memory.
    const snap = await q.limit(MAX_ENTRIES).get();
    let rows = snap.docs.map((d) => d.data() as ActivityLogEntry);
    if (filters?.entityType) rows = rows.filter((e) => e.entityType === filters.entityType);
    if (filters?.action) rows = rows.filter((e) => e.action === filters.action);
    if (filters?.entityId && filters?.userId) rows = rows.filter((e) => e.entityId === filters.entityId);
    if (filters?.since) {
      const sinceMs = new Date(filters.since).getTime();
      if (!Number.isNaN(sinceMs)) {
        rows = rows.filter((e) => new Date(e.createdAt).getTime() >= sinceMs);
      }
    }
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows;
  } catch (err) {
    console.warn("[activityLog] firestore read failed, falling back to memory: %s", err);
    return filterInMemory(filters);
  }
}

export async function getTaskActivity(todoId: string): Promise<ActivityLogEntry[]> {
  const rows = await readFromFirestoreOrMemory({ entityId: todoId, entityType: "todo", limit: 50 });
  return rows.slice(0, 50);
}

/** All entries since `sinceMs` (for admin engagement metrics). Capped at MAX_ENTRIES. */
export async function getActivityEntriesSince(sinceMs: number): Promise<ActivityLogEntry[]> {
  const since = new Date(sinceMs).toISOString();
  return readFromFirestoreOrMemory({ since });
}

export async function getActivityLog(
  filters?: ActivityLogFilters,
): Promise<{ entries: ActivityLogEntry[]; total: number }> {
  const rows = await readFromFirestoreOrMemory(filters);
  const total = rows.length;
  const offset = filters?.offset ?? 0;
  const limit = filters?.limit ?? 50;
  return { entries: rows.slice(offset, offset + limit), total };
}

/**
 * RGPD: anonymize audit entries for a deleted user (in-memory cache + activity_log_v2).
 */
export async function anonymizeActivityForUser(uid: string): Promise<void> {
  for (const entry of activityLog) {
    if (entry.userId === uid) {
      entry.userId = "deleted";
      entry.userEmail = "deleted user";
    }
  }

  const dbConn = await getDb();
  if (!dbConn) return;

  const BATCH = 400;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q: FirebaseFirestore.Query = dbConn.collection(COLLECTION).where("userId", "==", uid).limit(BATCH);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = dbConn.batch();
    for (const doc of snap.docs) {
      batch.update(doc.ref, { userId: "deleted", userEmail: "deleted user" });
    }
    await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH) break;
  }
}

/**
 * One-shot migration helper: copy the legacy monolithic `store/activityLog`
 * array into the new Firestore collection. Idempotent (uses each entry's `id`
 * as document id, so re-runs upsert without duplication). Opt-in via env var
 * `RUN_MIGRATION=activity_log_v2` to avoid running at every Cloud Run boot.
 *
 * Exported for the dedicated script (no automatic invocation).
 */
export async function migrateLegacyActivityLogToCollection(): Promise<{
  total: number;
  written: number;
}> {
  const dbConn = await getDb();
  if (!dbConn) {
    console.warn("[activityLog] migrate skipped — no Firestore client (USE_LOCAL_STORE or init failure)");
    return { total: 0, written: 0 };
  }
  const store = getStore();
  const legacy = (store.activityLog ?? []) as ActivityLogEntry[];
  console.log("[activityLog] migrate starting: %d legacy entries", legacy.length);
  let written = 0;
  // Batched writes (Firestore limit 500/batch).
  const BATCH = 400;
  for (let i = 0; i < legacy.length; i += BATCH) {
    const slice = legacy.slice(i, i + BATCH);
    const batch = dbConn.batch();
    for (const entry of slice) {
      if (!entry?.id) continue;
      batch.set(dbConn.collection(COLLECTION).doc(entry.id), entry);
      written++;
    }
    await batch.commit();
  }
  console.log("[activityLog] migrate done: wrote %d entries to %s", written, COLLECTION);
  return { total: legacy.length, written };
}

