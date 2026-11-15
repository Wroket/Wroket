/**
 * Per-database presence (cell cursor) — Firestore or local Map.
 * No Yjs; HTTP poll only.
 */

type Firestore = import("@google-cloud/firestore").Firestore;

import { stripUndefinedDeep } from "../utils/firestoreSanitize";

const USE_LOCAL = process.env.USE_LOCAL_STORE === "true";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT?.trim() ?? "";
const COLLECTION = process.env.DATABASE_PRESENCE_COLLECTION?.trim() || "database_presence";
const PRESENCE_TTL_MS = 15_000;

export interface DatabasePresencePeer {
  uid: string;
  displayName: string;
  at: string;
  cursor?: { rowId: string; columnId: string } | null;
}

interface PresenceDoc {
  databaseId: string;
  updatedAt: string;
  presence: Record<string, DatabasePresencePeer>;
}

let db: Firestore | null = null;
let initAttempted = false;
const localDocs = new Map<string, PresenceDoc>();

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
    console.error("[database-presence] Firestore init failed:", err);
    return null;
  }
}

function emptyDoc(databaseId: string): PresenceDoc {
  return {
    databaseId,
    updatedAt: new Date(0).toISOString(),
    presence: {},
  };
}

function prunePresence(
  presence: Record<string, DatabasePresencePeer>,
): Record<string, DatabasePresencePeer> {
  const now = Date.now();
  const next: Record<string, DatabasePresencePeer> = {};
  for (const [uid, peer] of Object.entries(presence)) {
    if (now - Date.parse(peer.at) <= PRESENCE_TTL_MS) next[uid] = peer;
  }
  return next;
}

async function loadDoc(databaseId: string): Promise<PresenceDoc> {
  const firestore = await getDb();
  if (!firestore) {
    return localDocs.get(databaseId) ?? emptyDoc(databaseId);
  }
  const snap = await firestore.collection(COLLECTION).doc(databaseId).get();
  if (!snap.exists) return emptyDoc(databaseId);
  const data = snap.data() as PresenceDoc;
  return {
    databaseId,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
    presence: prunePresence((data.presence as Record<string, DatabasePresencePeer>) ?? {}),
  };
}

async function saveDoc(doc: PresenceDoc): Promise<void> {
  const firestore = await getDb();
  const cleaned = { ...doc, presence: prunePresence(doc.presence), updatedAt: new Date().toISOString() };
  if (!firestore) {
    localDocs.set(doc.databaseId, cleaned);
    return;
  }
  await firestore.collection(COLLECTION).doc(doc.databaseId).set(stripUndefinedDeep(cleaned), { merge: true });
}

/**
 * Heartbeat: upsert self, prune TTL, return peers excluding self.
 */
export async function touchDatabasePresence(
  databaseId: string,
  peer: DatabasePresencePeer,
): Promise<DatabasePresencePeer[]> {
  const doc = await loadDoc(databaseId);
  doc.presence[peer.uid] = {
    uid: peer.uid,
    displayName: peer.displayName,
    at: new Date().toISOString(),
    cursor: peer.cursor === undefined ? doc.presence[peer.uid]?.cursor ?? null : peer.cursor,
  };
  await saveDoc(doc);
  return Object.values(prunePresence(doc.presence)).filter((p) => p.uid !== peer.uid);
}

export async function listDatabasePresence(
  databaseId: string,
  excludeUid?: string,
): Promise<DatabasePresencePeer[]> {
  const doc = await loadDoc(databaseId);
  const peers = Object.values(prunePresence(doc.presence));
  return excludeUid ? peers.filter((p) => p.uid !== excludeUid) : peers;
}
