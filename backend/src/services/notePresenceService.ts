/**
 * Note presence — cluster-safe via noteCollabStore (Firestore or local Map).
 */

export type { NotePresencePeer } from "./noteCollabStore";
export { touchCollabPresence as touchNotePresence, listCollabPresence as listNotePresence } from "./noteCollabStore";
