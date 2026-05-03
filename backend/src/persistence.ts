import fs from "fs";
import path from "path";

type Firestore = import("@google-cloud/firestore").Firestore;

const USE_LOCAL = process.env.USE_LOCAL_STORE === "true";
const STORE_PATH = path.join(__dirname, "..", "data", "local-store.json");

/** Number of Firestore documents used to store todos (`store/todos_0` … `todos_{N-1}`). */
export const TODO_SHARD_COUNT = 128;

/**
 * Stable shard for a user id (FNV-1a 32-bit). Must stay fixed after data exists in prod.
 */
export function todoShardIndex(userId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % TODO_SHARD_COUNT;
}

export function todoShardDocId(shardIndex: number): string {
  if (shardIndex < 0 || shardIndex >= TODO_SHARD_COUNT) {
    throw new RangeError(`todoShardDocId: index ${shardIndex} out of range`);
  }
  return `todos_${shardIndex}`;
}

const DOMAINS = [
  "users", "notifications", "collaborators",
  "teams", "projects", "sessions", "webhooks", "inviteLog", "comments", "notes", "archivedNotes", "activityLog", "attachments", "noteAttachments",
  "pendingCommentMentions",
  /** Short-lived tokens for password/Google login when TOTP is enabled (multi-instance safe) */
  "pendingTwoFactor",
  /** Outbound notification digest queue (hourly / daily delivery). */
  "notifDigestQueue",
] as const;

type Domain = (typeof DOMAINS)[number];

export interface StoreData {
  users?: Record<string, unknown>;
  todos?: Record<string, Record<string, unknown>>;
  notifications?: Record<string, unknown[]>;
  collaborators?: Record<string, unknown[]>;
  teams?: Record<string, unknown>;
  projects?: Record<string, unknown>;
  sessions?: Record<string, unknown>;
  webhooks?: Record<string, unknown[]>;
  inviteLog?: unknown[];
  comments?: Record<string, unknown[]>;
  notes?: Record<string, Record<string, unknown>>;
  /** Soft-deleted notes (same shape as `notes`), document `store/archivedNotes` in Firestore. */
  archivedNotes?: Record<string, Record<string, unknown>>;
  activityLog?: unknown[];
  attachments?: Record<string, unknown[]>;
  /** Note-namespace file attachment metadata (note not linked to a task). */
  noteAttachments?: Record<string, unknown[]>;
  /** Queued comment_mention notifications until invitee accepts collaboration */
  pendingCommentMentions?: unknown[];
  /** Map token -> pending 2FA row (TOTP / email OTP / both) after primary auth */
  pendingTwoFactor?: Record<string, Record<string, unknown>>;
  /** Per-user queue of outbound notifications pending digest flush */
  notifDigestQueue?: Record<string, unknown[]>;
}

let cachedStore: StoreData = {};
let db: Firestore | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const dirtyDomains = new Set<Domain>();
const dirtyTodoShards = new Set<number>();

/** Firestore onSnapshot unsubscribe functions for cross-replica live invalidation. */
const liveListenerUnsubs: Array<() => void> = [];

function loadFromDisk(): StoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as StoreData;
  } catch (err) {
    console.warn("[persistence] Cannot load %s: %s", STORE_PATH, err);
    return {};
  }
}

function saveToDisk(): void {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(cachedStore, null, 2), "utf-8");
  } catch (err) {
    console.error("[persistence] Cannot save to disk: %s", err);
  }
}

type TodoBlob = Record<string, Record<string, unknown>>;

function mergeTodoUserMaps(target: TodoBlob, chunk: unknown): void {
  if (!chunk || typeof chunk !== "object") return;
  for (const [userId, todos] of Object.entries(chunk as TodoBlob)) {
    target[userId] = todos;
  }
}

/**
 * Sharded `store/todos_*` is loaded first; legacy `store/todos` only fills users missing from shards.
 * If the same user exists in both, shard rows win entirely — so empty titles on shards could hide
 * good titles still present on legacy. Copy title (and tags if shard empty) from legacy when the
 * shard row has no usable title.
 */
function mergeLegacyTodoFieldsWhereShardEmpty(merged: TodoBlob, legacy: TodoBlob): void {
  for (const [userId, legacyUserTodos] of Object.entries(legacy)) {
    const mergedUser = merged[userId];
    if (!mergedUser) continue;
    for (const [todoId, legacyRow] of Object.entries(legacyUserTodos)) {
      const mergedRow = mergedUser[todoId];
      if (!legacyRow || typeof legacyRow !== "object" || !mergedRow || typeof mergedRow !== "object") continue;
      const legacyRec = legacyRow as Record<string, unknown>;
      const mergedRec = mergedRow as Record<string, unknown>;
      const mergedTitle = typeof mergedRec.title === "string" ? mergedRec.title.trim() : "";
      const legacyTitle = typeof legacyRec.title === "string" ? legacyRec.title.trim() : "";
      if (mergedTitle.length === 0 && legacyTitle.length > 0) {
        mergedRec.title = legacyTitle;
      }
      const mergedTags = mergedRec.tags;
      const legacyTags = legacyRec.tags;
      const mergedTagsEmpty = !Array.isArray(mergedTags) || mergedTags.length === 0;
      const legacyTagsOk = Array.isArray(legacyTags) && legacyTags.length > 0;
      if (mergedTagsEmpty && legacyTagsOk) {
        mergedRec.tags = legacyTags.filter((t): t is string => typeof t === "string");
      }
    }
  }
}

/** True if any shard document has at least one user bucket with data. */
function shardsHaveAnyUserData(shardSnaps: Array<{ exists: boolean; data: () => FirebaseFirestore.DocumentData | undefined }>): boolean {
  for (const snap of shardSnaps) {
    if (!snap.exists) continue;
    const raw = snap.data()?.data;
    if (raw && typeof raw === "object" && Object.keys(raw as object).length > 0) return true;
  }
  return false;
}

function buildTodoShardFromMerged(merged: TodoBlob, shardIndex: number): TodoBlob {
  const out: TodoBlob = {};
  for (const userId of Object.keys(merged)) {
    if (todoShardIndex(userId) !== shardIndex) continue;
    out[userId] = merged[userId]!;
  }
  return out;
}

async function loadFromFirestore(): Promise<StoreData> {
  if (!db) return {};
  const store: StoreData = {};

  const baseSnaps = await Promise.all(
    DOMAINS.map((d) => db!.collection("store").doc(d).get())
  );
  for (let i = 0; i < DOMAINS.length; i++) {
    const snap = baseSnaps[i];
    if (snap.exists) {
      (store as Record<string, unknown>)[DOMAINS[i]] = snap.data()!.data;
    }
  }

  const shardRefs = Array.from({ length: TODO_SHARD_COUNT }, (_, i) =>
    db!.collection("store").doc(todoShardDocId(i)).get()
  );
  const legacyRef = db.collection("store").doc("todos").get();
  const shardSnaps = await Promise.all(shardRefs);
  const legacySnap = await legacyRef;

  const mergedTodos: TodoBlob = {};
  for (const snap of shardSnaps) {
    if (snap.exists) mergeTodoUserMaps(mergedTodos, snap.data()?.data);
  }

  const legacyHadUsers =
    legacySnap.exists &&
    legacySnap.data()?.data &&
    typeof legacySnap.data()!.data === "object" &&
    Object.keys(legacySnap.data()!.data as object).length > 0;

  if (legacyHadUsers) {
    const legacyData = legacySnap.data()!.data as TodoBlob;
    for (const [userId, todos] of Object.entries(legacyData)) {
      const mergedBucket = mergedTodos[userId];
      const mergedEmpty =
        mergedBucket === undefined ||
        (typeof mergedBucket === "object" && Object.keys(mergedBucket).length === 0);
      const legacyNonEmpty =
        typeof todos === "object" &&
        todos !== null &&
        Object.keys(todos).length > 0;
      if (mergedEmpty || (legacyNonEmpty && mergedBucket === undefined)) {
        mergedTodos[userId] = todos;
      }
    }
    mergeLegacyTodoFieldsWhereShardEmpty(mergedTodos, legacyData);
  }

  if (Object.keys(mergedTodos).length > 0) {
    store.todos = mergedTodos;
  }

  const shardsFilled = shardsHaveAnyUserData(shardSnaps);
  if (legacyHadUsers && !shardsFilled) {
    for (let i = 0; i < TODO_SHARD_COUNT; i++) dirtyTodoShards.add(i);
    console.log(
      "[persistence] Legacy store/todos only — marking all %d todo shard(s) dirty for first flush to Firestore",
      TODO_SHARD_COUNT
    );
  }

  return store;
}

const FIRESTORE_BATCH_LIMIT = 450;

async function saveToFirestore(): Promise<void> {
  if (!db || (dirtyDomains.size === 0 && dirtyTodoShards.size === 0)) return;

  const ops: Array<{ ref: FirebaseFirestore.DocumentReference; payload: unknown }> = [];

  for (const domain of dirtyDomains) {
    const data = (cachedStore as Record<string, unknown>)[domain];
    if (data !== undefined) {
      ops.push({ ref: db.collection("store").doc(domain), payload: { data } });
    }
  }

  const mergedTodos = (cachedStore.todos ?? {}) as TodoBlob;
  for (const shardIndex of dirtyTodoShards) {
    const blob = buildTodoShardFromMerged(mergedTodos, shardIndex);
    ops.push({
      ref: db.collection("store").doc(todoShardDocId(shardIndex)),
      payload: { data: blob },
    });
  }

  const savingDomains = new Set(dirtyDomains);
  const savingShards = new Set(dirtyTodoShards);

  try {
    for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = db.batch();
      for (const { ref, payload } of chunk) {
        batch.set(ref, payload as FirebaseFirestore.DocumentData);
      }
      await batch.commit();
    }
    for (const d of savingDomains) dirtyDomains.delete(d);
    for (const s of savingShards) dirtyTodoShards.delete(s);
  } catch (err) {
    console.error("[persistence] Firestore batch save failed: %s", err);
  }
}

function armDebounce(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (USE_LOCAL) {
      saveToDisk();
      dirtyDomains.clear();
      dirtyTodoShards.clear();
    } else {
      saveToFirestore().catch((err) => console.error("[persistence] Async save error: %s", err));
    }
  }, 500);
}

/**
 * Loads the store from Firestore or disk depending on config.
 * Must be awaited before any service hydration.
 */
export async function initStore(): Promise<void> {
  if (USE_LOCAL) {
    cachedStore = loadFromDisk();
    console.log("[persistence] Loaded from local JSON file");
  } else {
    try {
      const { Firestore: FirestoreClass } = await import("@google-cloud/firestore");
      db = new FirestoreClass({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
      cachedStore = await loadFromFirestore();
      console.log("[persistence] Loaded from Firestore");
    } catch (err) {
      console.error("[persistence] Firestore init failed:", err);
      // Never serve an empty in-memory store in production: users would see "missing" tasks while
      // Firestore still holds data — looks like data loss. Fail startup so Cloud Run keeps/reverts.
      const isProd = process.env.NODE_ENV === "production";
      if (isProd) {
        throw err;
      }
      console.warn("[persistence] Dev fallback: starting with empty store (set USE_LOCAL_STORE=true for file-backed dev)");
      db = null;
      cachedStore = {};
    }
  }
}

export function getStore(): StoreData {
  return cachedStore;
}

/**
 * Marks a domain as dirty and schedules a debounced write.
 * Optionally pass the domain name for granular Firestore batches.
 */
export function scheduleSave(domain?: Domain): void {
  if (domain) {
    dirtyDomains.add(domain);
  } else {
    DOMAINS.forEach((d) => {
      if ((cachedStore as Record<string, unknown>)[d] !== undefined) {
        dirtyDomains.add(d);
      }
    });
  }
  armDebounce();
}

/**
 * Marks todo shard document(s) dirty. Uses merged `cachedStore.todos` at flush time.
 * Pass `"all"` after cross-user mutations (e.g. phase cleanup, GDPR) or when unsure.
 */
export function scheduleTodoShardPersist(shardSpec: "all" | number | number[]): void {
  if (shardSpec === "all") {
    for (let i = 0; i < TODO_SHARD_COUNT; i++) dirtyTodoShards.add(i);
  } else {
    const arr = Array.isArray(shardSpec) ? shardSpec : [shardSpec];
    for (const i of arr) {
      if (i >= 0 && i < TODO_SHARD_COUNT) dirtyTodoShards.add(i);
    }
  }
  armDebounce();
}

/**
 * Immediately flush any pending writes to disk or Firestore.
 *
 * Why: the 500 ms debounce in scheduleSave means a process crash or SIGTERM
 * between a write and the timer firing will silently lose the last mutation.
 * Call this in SIGTERM / SIGINT handlers (see server.ts) to guarantee the
 * store is consistent when the container shuts down — especially important on
 * Cloud Run where instances are replaced frequently.
 */
export async function flushNow(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (USE_LOCAL) {
    saveToDisk();
    dirtyDomains.clear();
    dirtyTodoShards.clear();
  } else {
    await saveToFirestore();
  }
}

// ─── Cross-replica live invalidation via Firestore onSnapshot ────────────────

/**
 * Apply a domain snapshot received from Firestore to the in-memory cache.
 * Exported for unit tests only — do not call directly in production code.
 */
export function _applyDomainSnapshot(domain: string, data: unknown): void {
  (cachedStore as Record<string, unknown>)[domain] = data;
  console.log(
    JSON.stringify({ event: "store.invalidation.received", domain, ts: Date.now() })
  );
}

/**
 * Apply a todo shard snapshot to the in-memory cache.
 * Only user buckets belonging to this shard are replaced; others are untouched.
 * Exported for unit tests only — do not call directly in production code.
 */
export function _applyTodoShardSnapshot(shardId: string, shardIndex: number, data: unknown): void {
  if (!data || typeof data !== "object") return;
  if (!cachedStore.todos) cachedStore.todos = {} as Record<string, Record<string, unknown>>;
  const blob = data as TodoBlob;

  // Replace user buckets that belong to this shard.
  for (const [userId, todos] of Object.entries(blob)) {
    if (todoShardIndex(userId) === shardIndex) {
      (cachedStore.todos as Record<string, unknown>)[userId] = todos;
    }
  }
  // Remove buckets no longer present in this shard.
  for (const userId of Object.keys(cachedStore.todos as Record<string, unknown>)) {
    if (todoShardIndex(userId) === shardIndex && !(blob[userId])) {
      delete (cachedStore.todos as Record<string, unknown>)[userId];
    }
  }
  console.log(
    JSON.stringify({ event: "store.invalidation.received", shard: shardId, ts: Date.now() })
  );
}

/**
 * Attach Firestore onSnapshot listeners for each domain document and todo shard.
 * When another Cloud Run replica writes to Firestore, the snapshot arrives here
 * and the in-memory cache is updated without a restart — eliminating cross-replica staleness.
 *
 * No-op when USE_LOCAL_STORE=true or when the Firestore client is not initialised.
 * Must be called AFTER initStore() and todo hydration (server.ts startup sequence).
 */
export function attachLiveInvalidation(): void {
  if (USE_LOCAL || !db) return;

  // Domain documents (notes, projects, teams, todos v1 legacy, etc.)
  for (const domain of DOMAINS) {
    const ref = db.collection("store").doc(domain);
    let isFirst = true;
    const unsub = ref.onSnapshot(
      (snap) => {
        // Skip the initial snapshot — we already have this data from initStore().
        if (isFirst) { isFirst = false; return; }
        const data = snap.data()?.data;
        _applyDomainSnapshot(domain, data);
      },
      (err) => {
        console.error(JSON.stringify({ event: "store.invalidation.error", domain, error: String(err) }));
      }
    );
    liveListenerUnsubs.push(unsub);
  }

  // Todo shard documents (todos_0 … todos_127)
  for (let i = 0; i < TODO_SHARD_COUNT; i++) {
    const shardId = todoShardDocId(i);
    const ref = db.collection("store").doc(shardId);
    const shardIndex = i;
    let isFirst = true;
    const unsub = ref.onSnapshot(
      (snap) => {
        if (isFirst) { isFirst = false; return; }
        const data = snap.data()?.data;
        _applyTodoShardSnapshot(shardId, shardIndex, data);
      },
      (err) => {
        console.error(JSON.stringify({ event: "store.invalidation.error", shard: shardId, error: String(err) }));
      }
    );
    liveListenerUnsubs.push(unsub);
  }

  console.log(
    JSON.stringify({ event: "store.invalidation.attached", listenerCount: liveListenerUnsubs.length })
  );
}

/**
 * Detach all live-invalidation Firestore listeners.
 * Called during graceful shutdown to release connections cleanly.
 */
export function detachLiveInvalidation(): void {
  for (const unsub of liveListenerUnsubs) {
    try { unsub(); } catch { /* ignore */ }
  }
  liveListenerUnsubs.length = 0;
}

// ─── Test helpers (never called in production paths) ─────────────────────────

/** Exposed for tests only — read the raw in-memory cache. */
export function _getStoreForTest(): StoreData { return cachedStore; }
/** Exposed for tests only — replace the in-memory cache. */
export function _resetStoreForTest(data: StoreData): void { cachedStore = data; }

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight read for readiness probes (/health/ready). Does not verify full hydration.
 * - Local JSON: always ok if process is up.
 * - Firestore: single document read on store/users (exists in prod).
 */
export async function pingDatastore(): Promise<{ ok: boolean; backend: "local" | "firestore" }> {
  if (USE_LOCAL) {
    return { ok: true, backend: "local" };
  }
  if (!db) {
    return { ok: false, backend: "firestore" };
  }
  try {
    await db.collection("store").doc("users").get();
    return { ok: true, backend: "firestore" };
  } catch (err) {
    console.error("[persistence] pingDatastore failed:", err);
    return { ok: false, backend: "firestore" };
  }
}
