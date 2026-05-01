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
  /** UID of a specific collaborator this note is directly shared with. */
  sharedWithUid?: string;
  /** Resolved email of the collaborator (for display). */
  sharedWithEmail?: string;
  /** Email of the note owner — populated by the server for shared notes (display only). */
  ownerEmail?: string;
  createdAt: string;
  updatedAt: string;
  /** Present when the note is listed from the archive (soft-deleted). */
  archivedAt?: string;
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

export async function getTodoNoteMap(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE_URL}/notes/todo-note-map`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger la carte notes-tâches");
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
  sharedWithEmail?: string | null;
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

export async function getArchivedNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE_URL}/notes/archived`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les notes archivées");
  return res.json();
}

export async function restoreArchivedNoteApi(id: string): Promise<Note> {
  const res = await fetch(`${API_BASE_URL}/notes/archived/${id}/restore`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Impossible de restaurer la note");
  return res.json();
}

export async function purgeArchivedNoteApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notes/archived/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error("Impossible de supprimer la note définitivement");
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
  return exportNotes("md");
}

export async function exportNotes(format: "csv" | "json" | "md"): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notes/export?format=${format}`, { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = format === "json" ? "json" : format === "csv" ? "csv" : "md";
  a.download = `wroket-notes.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importNotesFile(file: File): Promise<{ created: number; errors: Array<{ row: number; message: string }>; total: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/notes/import`, { method: "POST", body: fd, credentials: "include" });
  if (!res.ok) throw new Error("Import failed");
  return res.json();
}

// ---- Note Attachments ----

export interface NoteAttachment {
  id: string;
  noteId: string;
  ownerUid: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface NoteAttachmentsResponse {
  noteAttachments: NoteAttachment[];
  taskAttachments: Array<{
    id: string;
    todoId: string;
    userId: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
  }>;
}

export async function getNoteAttachments(noteId: string): Promise<NoteAttachmentsResponse> {
  const res = await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/attachments`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger les pièces jointes");
  return res.json();
}

export async function uploadNoteAttachment(
  noteId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ attachment?: NoteAttachment; taskAttachmentId?: string; linkedToTaskId?: string }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open("POST", `${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/attachments`);
    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const msg = (() => { try { return JSON.parse(xhr.responseText)?.message; } catch { return null; } })();
        reject(new Error(msg ?? "Erreur lors de l'upload"));
      }
    };
    xhr.onerror = () => reject(new Error("Erreur réseau"));
    xhr.send(fd);
  });
}

export function getNoteAttachmentDownloadUrl(noteId: string, attachmentId: string): string {
  return `${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

export function getTaskAttachmentViaNoteUrl(noteId: string, todoId: string, attachmentId: string): string {
  return `${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/task-attachments/${encodeURIComponent(todoId)}/${encodeURIComponent(attachmentId)}`;
}

export async function deleteNoteAttachment(noteId: string, attachmentId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new Error("Impossible de supprimer la pièce jointe");
}
