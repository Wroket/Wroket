import { getStore } from "../persistence";
import { listProjects } from "./projectService";

export interface SearchResult {
  type: "todo" | "project" | "note";
  id: string;
  title: string;
  snippet?: string;
  status?: string;
}

const MAX_QUERY_LENGTH = 200;
const MAX_RESULTS = 50;

/**
 * Full-text search across todos, projects and notes visible to the user.
 * Projects are filtered through listProjects (ownership + team membership).
 */
export function search(uid: string, query: string, userEmail: string): SearchResult[] {
  if (!query || query.length < 2) return [];
  const q = query.substring(0, MAX_QUERY_LENGTH).toLowerCase();
  const store = getStore();
  const results: SearchResult[] = [];

  const todoStore = (store.todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const userTodos = todoStore[uid] ?? {};
  for (const todo of Object.values(userTodos)) {
    if (results.length >= MAX_RESULTS) break;
    const title = (todo.title as string) ?? "";
    const tags = (todo.tags as string[]) ?? [];
    if (title.toLowerCase().includes(q) || tags.some((t: string) => t.toLowerCase().includes(q))) {
      results.push({ type: "todo", id: todo.id as string, title, status: todo.status as string });
    }
  }

  const accessibleProjects = listProjects(uid, userEmail);
  for (const proj of accessibleProjects) {
    if (results.length >= MAX_RESULTS) break;
    const name = proj.name ?? "";
    const desc = proj.description ?? "";
    if (name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
      results.push({ type: "project", id: proj.id, title: name, status: proj.status, snippet: desc.substring(0, 100) });
    }
  }

  const noteStore = (store.notes ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const userNotes = noteStore[uid] ?? {};
  for (const note of Object.values(userNotes)) {
    if (results.length >= MAX_RESULTS) break;
    const title = (note.title as string) ?? "";
    const content = (note.content as string) ?? "";
    if (title.toLowerCase().includes(q) || content.toLowerCase().includes(q)) {
      const idx = content.toLowerCase().indexOf(q);
      const snippetStart = Math.max(0, idx - 30);
      results.push({ type: "note", id: note.id as string, title: title || "Sans titre", snippet: content.substring(snippetStart, snippetStart + 80) });
    }
  }

  return results;
}
