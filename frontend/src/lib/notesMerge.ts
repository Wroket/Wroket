import type { Note } from "@/lib/api";

/**
 * Merge the server's own-notes list with the browser cache.
 * - Server is source of truth for notes that exist on the server.
 * - Local rows absent from the server are kept only if still pending sync (dirty / deleted queue).
 * - For notes present on both sides, a dirty local row wins only if its updatedAt is newer than the server's.
 */
export function mergeOwnNotesFromServer(
  serverNotes: Note[],
  localNotes: Note[],
  dirtyIds: readonly string[],
  deletedIds: readonly string[],
): Note[] {
  // Safety guard: if the server returns 0 notes but local cache has notes,
  // the server response is likely stale (e.g. backend cache wiped by a bad
  // onSnapshot). Fall back to local cache so we never purge valid data.
  if (serverNotes.length === 0 && localNotes.length > 0) {
    return [...localNotes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  const dirtySet = new Set(dirtyIds);
  const deletedSet = new Set(deletedIds);
  const serverIds = new Set(serverNotes.map((n) => n.id));

  const merged = new Map<string, Note>();
  for (const n of serverNotes) merged.set(n.id, n);

  for (const n of localNotes) {
    const onServer = serverIds.has(n.id);
    const isPendingSync = dirtySet.has(n.id) || deletedSet.has(n.id);

    if (!onServer) {
      if (isPendingSync) merged.set(n.id, n);
      continue;
    }
    if (isPendingSync) {
      const existing = merged.get(n.id)!;
      if (new Date(n.updatedAt) > new Date(existing.updatedAt)) {
        merged.set(n.id, n);
      }
    }
  }

  return [...merged.values()].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
