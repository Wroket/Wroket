import { API_BASE_URL } from "./core";

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  pinned: boolean;
  folder?: string;
  tags?: string[];
  todoId?: string | null;
  projectId?: string | null;
  shared?: boolean;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notes");
  return res.json();
}

export async function getSharedNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes/shared`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notes partagées");
  return res.json();
}

export async function getNotesByTodo(todoId: string): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes/by-todo/${todoId}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notes");
  return res.json();
}

export async function createNoteApi(input: {
  title?: string;
  content?: string;
  id?: string;
  folder?: string;
  tags?: string[];
  todoId?: string;
  projectId?: string;
  shared?: boolean;
  teamId?: string;
}): Promise<Note> {
  const res = await fetch(`${API_BASE_URL}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de créer la note");
  return res.json();
}

export async function updateNoteApi(id: string, input: {
  title?: string;
  content?: string;
  pinned?: boolean;
  folder?: string;
  tags?: string[];
  todoId?: string | null;
  projectId?: string | null;
  shared?: boolean;
  teamId?: string;
}): Promise<Note> {
  const res = await fetch(`${API_BASE_URL}/notes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de mettre à jour la note");
  return res.json();
}

export async function deleteNoteApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notes/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de supprimer la note");
}

export async function syncNotesApi(notes: Array<{
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  pinned?: boolean;
}>): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Sync failed");
  return res.json();
}

export async function exportNotesMarkdown(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notes/export`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "wroket-notes.md";
  a.click();
  URL.revokeObjectURL(url);
}
