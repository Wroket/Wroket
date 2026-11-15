/**
 * Per-note Yjs state + presence in Firestore (cluster-safe).
 * Falls back to in-process Maps when USE_LOCAL_STORE / no Firestore.
 */

type Firestore = import("@google-cloud/firestore").Firestore;

import * as Y from "yjs";
import { stripUndefinedDeep } from "../utils/firestoreSanitize";

const USE_LOCAL = process.env.USE_LOCAL_STORE === "true";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT?.trim() ?? "";
const COLLECTION = process.env.NOTE_COLLAB_COLLECTION?.trim() || "note_collab";
const PRESENCE_TTL_MS = 15_000;

export interface NotePresencePeer {
  uid: string;
  displayName: string;
  at: string;
  cursor?: { blockId: string; from: number; to: number } | null;
}

interface CollabDoc {
  noteId: string;
  /** Base64 Yjs state update (full document). */
  yjsUpdateB64: string;
  updatedAt: string;
  presence: Record<string, NotePresencePeer>;
}

let db: Firestore | null = null;
let initAttempted = false;

const localDocs = new Map<string, CollabDoc>();

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
    console.error("[note-collab] Firestore init failed:", err);
    return null;
  }
}

function emptyDoc(noteId: string): CollabDoc {
  return {
    noteId,
    yjsUpdateB64: "",
    updatedAt: new Date(0).toISOString(),
    presence: {},
  };
}

function prunePresence(presence: Record<string, NotePresencePeer>): Record<string, NotePresencePeer> {
  const now = Date.now();
  const next: Record<string, NotePresencePeer> = {};
  for (const [uid, peer] of Object.entries(presence)) {
    if (now - Date.parse(peer.at) <= PRESENCE_TTL_MS) next[uid] = peer;
  }
  return next;
}

async function loadDoc(noteId: string): Promise<CollabDoc> {
  const firestore = await getDb();
  if (!firestore) {
    return localDocs.get(noteId) ?? emptyDoc(noteId);
  }
  const snap = await firestore.collection(COLLECTION).doc(noteId).get();
  if (!snap.exists) return emptyDoc(noteId);
  const data = snap.data() as CollabDoc;
  return {
    noteId,
    yjsUpdateB64: typeof data.yjsUpdateB64 === "string" ? data.yjsUpdateB64 : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
    presence: prunePresence((data.presence as Record<string, NotePresencePeer>) ?? {}),
  };
}

async function saveDoc(doc: CollabDoc): Promise<void> {
  const firestore = await getDb();
  const cleaned = {
    ...doc,
    presence: prunePresence(doc.presence),
  };
  if (!firestore) {
    localDocs.set(doc.noteId, cleaned);
    return;
  }
  await firestore.collection(COLLECTION).doc(doc.noteId).set(stripUndefinedDeep(cleaned), { merge: true });
}

function b64ToUint8(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  return new Uint8Array(Buffer.from(b64, "base64"));
}

function uint8ToB64(u8: Uint8Array): string {
  return Buffer.from(u8).toString("base64");
}

/**
 * Merge client Yjs update into stored state; return update for client (full state).
 */
export async function syncNoteYjs(
  noteId: string,
  clientUpdateB64: string,
  clientStateVectorB64?: string,
): Promise<{ updateB64: string; updatedAt: string }> {
  const stored = await loadDoc(noteId);
  const ydoc = new Y.Doc();
  if (stored.yjsUpdateB64) {
    Y.applyUpdate(ydoc, b64ToUint8(stored.yjsUpdateB64));
  }
  if (clientUpdateB64) {
    Y.applyUpdate(ydoc, b64ToUint8(clientUpdateB64));
  }
  const full = Y.encodeStateAsUpdate(ydoc);
  const updatedAt = new Date().toISOString();
  await saveDoc({
    ...stored,
    yjsUpdateB64: uint8ToB64(full),
    updatedAt,
  });

  let reply: Uint8Array;
  if (clientStateVectorB64) {
    reply = Y.encodeStateAsUpdate(ydoc, b64ToUint8(clientStateVectorB64));
  } else {
    reply = full;
  }
  ydoc.destroy();
  return { updateB64: uint8ToB64(reply), updatedAt };
}

/**
 * Heartbeat presence + optional cursor; returns other peers.
 */
export async function touchCollabPresence(
  noteId: string,
  uid: string,
  displayName: string,
  cursor?: NotePresencePeer["cursor"],
): Promise<NotePresencePeer[]> {
  const stored = await loadDoc(noteId);
  const peer: NotePresencePeer = {
    uid,
    displayName: displayName.substring(0, 80),
    at: new Date().toISOString(),
    cursor: cursor ?? null,
  };
  const presence = prunePresence({ ...stored.presence, [uid]: peer });
  await saveDoc({ ...stored, presence });
  return Object.values(presence).filter((p) => p.uid !== uid);
}

export async function listCollabPresence(noteId: string, excludeUid?: string): Promise<NotePresencePeer[]> {
  const stored = await loadDoc(noteId);
  const presence = prunePresence(stored.presence);
  if (Object.keys(presence).length !== Object.keys(stored.presence).length) {
    await saveDoc({ ...stored, presence });
  }
  return Object.values(presence).filter((p) => p.uid !== excludeUid);
}
