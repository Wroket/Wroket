import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listNotes,
  listSharedNotes,
  listNotesByTodo,
  getTodoNoteMap,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  syncNotes,
  CreateNoteInput,
  UpdateNoteInput,
} from "../services/noteService";
import { ValidationError } from "../utils/errors";

export async function list(req: AuthenticatedRequest, res: Response) {
  res.status(200).json(listNotes(req.user!.uid));
}

export async function listShared(req: AuthenticatedRequest, res: Response) {
  res.status(200).json(listSharedNotes(req.user!.uid, req.user!.email));
}

export async function get(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  res.status(200).json(getNote(req.user!.uid, id));
}

export async function byTodo(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  res.status(200).json(listNotesByTodo(req.user!.uid, todoId));
}

export async function todoNoteMap(req: AuthenticatedRequest, res: Response) {
  res.status(200).json(getTodoNoteMap(req.user!.uid));
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const input = req.body as CreateNoteInput;
  const note = createNote(req.user!.uid, input);
  res.status(201).json(note);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const input = req.body as UpdateNoteInput;
  const note = updateNote(req.user!.uid, id, input);
  res.status(200).json(note);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  deleteNote(req.user!.uid, id);
  res.status(200).json({ ok: true });
}

export async function exportNotes(req: AuthenticatedRequest, res: Response) {
  const notes = listNotes(req.user!.uid);
  const md = notes
    .map((n) => {
      const header = `# ${n.title || "Sans titre"}\n`;
      const meta = n.folder ? `> Dossier: ${n.folder}\n` : "";
      const tags = n.tags?.length ? `> Tags: ${n.tags.join(", ")}\n` : "";
      return header + meta + tags + "\n" + (n.content || "") + "\n";
    })
    .join("\n---\n\n");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=wroket-notes.md");
  res.send(md);
}

export async function sync(req: AuthenticatedRequest, res: Response) {
  const { notes } = req.body as { notes?: Array<{ id: string; title: string; content: string; updatedAt: string; pinned?: boolean }> };
  if (!Array.isArray(notes)) throw new ValidationError("notes[] requis");
  if (notes.length > 200) throw new ValidationError("Trop de notes à synchroniser (max 200)");
  const result = syncNotes(req.user!.uid, notes);
  res.status(200).json(result);
}
