import { listProjects } from "./projectService";
import { listContacts } from "./contactService";
import { listUserDatabases } from "./userDatabaseService";
import { listTodos, listAssignedToMe } from "./todoService";
import { listNotes, listSharedNotes } from "./noteService";

export interface SearchResult {
  type: "todo" | "project" | "note" | "contact" | "database" | "tag";
  id: string;
  title: string;
  snippet?: string;
  status?: string;
}

const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 200;
const MAX_RESULTS = 50;

function includesQ(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

function tagMatches(tags: string[] | undefined, q: string): boolean {
  return (tags ?? []).some((t) => includesQ(t, q));
}

/**
 * Full-text search across todos, projects, notes and tags visible to the user.
 * Todos are loaded via todoService (works with todos_v2). Min query length: 3.
 */
export async function search(uid: string, query: string, userEmail: string): Promise<SearchResult[]> {
  const trimmed = (query ?? "").trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];
  const q = trimmed.substring(0, MAX_QUERY_LENGTH).toLowerCase();
  const results: SearchResult[] = [];
  /** Lowercase key → original casing (first seen) so /todos?tag= matches stored tags. */
  const matchingTags = new Map<string, string>();

  const collectMatchingTags = (tags: string[] | undefined) => {
    for (const tag of tags ?? []) {
      const normalized = tag.trim();
      if (!normalized || !includesQ(normalized, q)) continue;
      const key = normalized.toLowerCase();
      if (!matchingTags.has(key)) matchingTags.set(key, normalized);
    }
  };

  const [ownedTodos, assignedTodos] = await Promise.all([
    listTodos(uid),
    listAssignedToMe(uid),
  ]);
  const todoById = new Map<string, (typeof ownedTodos)[number]>();
  for (const todo of ownedTodos) todoById.set(todo.id, todo);
  for (const todo of assignedTodos) {
    if (!todoById.has(todo.id)) todoById.set(todo.id, todo);
  }

  for (const todo of todoById.values()) {
    if (results.length >= MAX_RESULTS) break;
    const title = todo.title ?? "";
    const tags = todo.tags ?? [];
    collectMatchingTags(tags);
    if (includesQ(title, q) || tagMatches(tags, q)) {
      results.push({ type: "todo", id: todo.id, title, status: todo.status });
    }
  }

  const accessibleProjects = listProjects(uid, userEmail);
  for (const proj of accessibleProjects) {
    if (results.length >= MAX_RESULTS) break;
    const name = proj.name ?? "";
    const desc = proj.description ?? "";
    const projTags = proj.tags ?? [];
    collectMatchingTags(projTags);
    if (includesQ(name, q) || includesQ(desc, q) || tagMatches(projTags, q)) {
      results.push({
        type: "project",
        id: proj.id,
        title: name,
        status: proj.status,
        snippet: desc.substring(0, 100) || undefined,
      });
    }
  }

  const ownNotes = listNotes(uid).filter((n) => !n.archivedAt);
  const sharedNotes = listSharedNotes(uid, userEmail).filter((n) => !n.archivedAt);
  const noteById = new Map<string, (typeof ownNotes)[number]>();
  for (const note of ownNotes) noteById.set(note.id, note);
  for (const note of sharedNotes) {
    if (!noteById.has(note.id)) noteById.set(note.id, note);
  }

  for (const note of noteById.values()) {
    if (results.length >= MAX_RESULTS) break;
    const title = note.title ?? "";
    const content = note.content ?? "";
    const noteTags = note.tags ?? [];
    collectMatchingTags(noteTags);
    if (includesQ(title, q) || includesQ(content, q) || tagMatches(noteTags, q)) {
      const idx = content.toLowerCase().indexOf(q);
      const snippetStart = idx >= 0 ? Math.max(0, idx - 30) : 0;
      results.push({
        type: "note",
        id: note.id,
        title: title || "Sans titre",
        snippet: content ? content.substring(snippetStart, snippetStart + 80) : undefined,
      });
    }
  }

  for (const tag of [...matchingTags.values()].sort((a, b) => a.localeCompare(b))) {
    if (results.length >= MAX_RESULTS) break;
    results.push({ type: "tag", id: tag, title: tag });
  }

  for (const contact of listContacts(uid, q)) {
    if (results.length >= MAX_RESULTS) break;
    const name =
      [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
      contact.email ||
      "—";
    const snippet = [contact.email, contact.company].filter(Boolean).join(" · ");
    results.push({ type: "contact", id: contact.id, title: name, snippet: snippet || undefined });
  }

  for (const db of listUserDatabases(uid)) {
    if (results.length >= MAX_RESULTS) break;
    if (includesQ(db.name, q)) {
      results.push({
        type: "database",
        id: db.id,
        title: db.name,
        snippet: `${db.columns.length} col.`,
      });
    }
  }

  return results;
}
