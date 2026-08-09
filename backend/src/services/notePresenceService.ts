/** In-memory presence for open notes (ephemeral — not persisted). */

export interface NotePresencePeer {
  uid: string;
  displayName: string;
  at: string;
}

const presenceByNote = new Map<string, Map<string, NotePresencePeer>>();

const TTL_MS = 15_000;

/**
 * Heartbeat while a user has a note open. Prunes stale peers.
 */
export function touchNotePresence(
  noteId: string,
  uid: string,
  displayName: string,
): NotePresencePeer[] {
  let map = presenceByNote.get(noteId);
  if (!map) {
    map = new Map();
    presenceByNote.set(noteId, map);
  }
  const now = Date.now();
  map.set(uid, { uid, displayName: displayName.substring(0, 80), at: new Date(now).toISOString() });
  for (const [peerUid, peer] of [...map.entries()]) {
    if (now - Date.parse(peer.at) > TTL_MS) map.delete(peerUid);
  }
  return [...map.values()].filter((p) => p.uid !== uid);
}

export function listNotePresence(noteId: string, excludeUid?: string): NotePresencePeer[] {
  const map = presenceByNote.get(noteId);
  if (!map) return [];
  const now = Date.now();
  for (const [peerUid, peer] of [...map.entries()]) {
    if (now - Date.parse(peer.at) > TTL_MS) map.delete(peerUid);
  }
  return [...map.values()].filter((p) => p.uid !== excludeUid);
}
