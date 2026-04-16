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
import { newMentionsOnly } from "../services/commentService";
import { createNotification } from "../services/notificationService";
import { findUserByEmail } from "../services/authService";
import { ValidationError } from "../utils/errors";

const CSV_FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);
function csvSafe(value: string): string {
  let v = value.replace(/"/g, '""');
  if (v.length > 0 && CSV_FORMULA_TRIGGERS.has(v[0])) v = `'${v}`;
  return `"${v}"`;
}

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
  const body = req.body ?? {};
  if (body.title !== undefined && typeof body.title !== "string") {
    throw new ValidationError("title doit être une chaîne");
  }
  if (body.content !== undefined && typeof body.content !== "string") {
    throw new ValidationError("content doit être une chaîne");
  }
  if (body.folder !== undefined && typeof body.folder !== "string") {
    throw new ValidationError("folder doit être une chaîne");
  }
  if (body.tags !== undefined && (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string"))) {
    throw new ValidationError("tags doit être un tableau de chaînes");
  }
  if (body.todoId !== undefined && typeof body.todoId !== "string") {
    throw new ValidationError("todoId doit être une chaîne");
  }
  if (body.projectId !== undefined && typeof body.projectId !== "string") {
    throw new ValidationError("projectId doit être une chaîne");
  }
  if (body.teamId !== undefined && typeof body.teamId !== "string") {
    throw new ValidationError("teamId doit être une chaîne");
  }
  if (body.shared !== undefined && typeof body.shared !== "boolean") {
    throw new ValidationError("shared doit être un booléen");
  }
  const input = body as CreateNoteInput;
  const note = createNote(req.user!.uid, input);
  res.status(201).json(note);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const uid = req.user!.uid;
  const body = req.body ?? {};
  if (body.title !== undefined && typeof body.title !== "string") {
    throw new ValidationError("title doit être une chaîne");
  }
  if (body.content !== undefined && typeof body.content !== "string") {
    throw new ValidationError("content doit être une chaîne");
  }
  if (body.folder !== undefined && typeof body.folder !== "string") {
    throw new ValidationError("folder doit être une chaîne");
  }
  if (body.tags !== undefined && (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string"))) {
    throw new ValidationError("tags doit être un tableau de chaînes");
  }
  if (body.todoId !== undefined && body.todoId !== null && typeof body.todoId !== "string") {
    throw new ValidationError("todoId doit être une chaîne ou null");
  }
  if (body.projectId !== undefined && body.projectId !== null && typeof body.projectId !== "string") {
    throw new ValidationError("projectId doit être une chaîne ou null");
  }
  if (body.teamId !== undefined && typeof body.teamId !== "string") {
    throw new ValidationError("teamId doit être une chaîne");
  }
  if (body.pinned !== undefined && typeof body.pinned !== "boolean") {
    throw new ValidationError("pinned doit être un booléen");
  }
  if (body.shared !== undefined && typeof body.shared !== "boolean") {
    throw new ValidationError("shared doit être un booléen");
  }
  if (
    body.sharedWithEmail !== undefined &&
    body.sharedWithEmail !== null &&
    typeof body.sharedWithEmail !== "string"
  ) {
    throw new ValidationError("sharedWithEmail doit être une chaîne ou null");
  }

  // Capture current content for mention diff (before update)
  const existingNote = getNote(uid, id);
  const oldContent = existingNote.content;

  const input = body as UpdateNoteInput;
  const note = updateNote(uid, id, input);

  // Detect and notify new @email mentions in content
  if (typeof body.content === "string") {
    const freshMentions = newMentionsOnly(oldContent, body.content);
    for (const email of freshMentions) {
      const mentioned = findUserByEmail(email);
      if (mentioned && mentioned.uid !== uid) {
        createNotification(
          mentioned.uid,
          "note_mention",
          "Mention dans une note",
          `${req.user!.email} vous a mentionné dans la note « ${note.title} »`,
          { noteId: id, noteTitle: note.title },
        );
      }
    }
  }

  res.status(200).json(note);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  deleteNote(req.user!.uid, id);
  res.status(200).json({ ok: true });
}

export async function exportNotes(req: AuthenticatedRequest, res: Response) {
  const format = (req.query.format as string)?.toLowerCase();
  const notes = listNotes(req.user!.uid);

  if (format === "json") {
    const data = notes.map((n) => ({
      id: n.id, title: n.title, content: n.content, pinned: n.pinned,
      folder: n.folder, tags: n.tags, todoId: n.todoId, projectId: n.projectId,
      createdAt: n.createdAt, updatedAt: n.updatedAt,
    }));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=wroket-notes.json");
    res.send(JSON.stringify(data, null, 2));
    return;
  }

  if (format === "csv") {
    const header = "id,title,content,pinned,folder,tags,todoId,projectId,createdAt,updatedAt\n";
    const rows = notes
      .map((n) => [
        n.id, csvSafe(n.title ?? ""), csvSafe((n.content ?? "").substring(0, 5000)),
        n.pinned ? "true" : "false", csvSafe(n.folder ?? ""),
        csvSafe((n.tags ?? []).join(", ")), n.todoId ?? "", n.projectId ?? "",
        n.createdAt ?? "", n.updatedAt ?? "",
      ].join(","))
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=wroket-notes.csv");
    res.send(header + rows);
    return;
  }

  // Default: markdown
  const md = notes
    .map((n) => {
      const hdr = `# ${n.title || "Sans titre"}\n`;
      const meta = n.folder ? `> Dossier: ${n.folder}\n` : "";
      const tags = n.tags?.length ? `> Tags: ${n.tags.join(", ")}\n` : "";
      return hdr + meta + tags + "\n" + (n.content || "") + "\n";
    })
    .join("\n---\n\n");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=wroket-notes.md");
  res.send(md);
}

export async function importNotes(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;

  let notes: Array<{ title?: string; content?: string; folder?: string; tags?: string[] | string; pinned?: boolean }>;

  if (req.file) {
    const text = req.file.buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (req.file.originalname.endsWith(".json") || req.file.mimetype === "application/json") {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new ValidationError("Le JSON doit contenir un tableau de notes");
      notes = parsed;
    } else {
      notes = parseCsvToNoteObjects(text);
    }
  } else if (req.body?.notes && Array.isArray(req.body.notes)) {
    notes = req.body.notes;
  } else {
    throw new ValidationError("Fichier ou tableau de notes requis");
  }

  if (notes.length === 0) throw new ValidationError("Aucune note à importer");
  if (notes.length > 500) throw new ValidationError("Maximum 500 notes par import");

  let created = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    try {
      createNote(uid, {
        title: typeof n.title === "string" ? n.title.trim() : "Note importée",
        content: typeof n.content === "string" ? n.content : "",
        folder: typeof n.folder === "string" ? n.folder : undefined,
        tags: Array.isArray(n.tags) ? n.tags : typeof n.tags === "string" ? n.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
      });
      created++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Erreur" });
    }
  }

  res.status(201).json({ created, errors, total: notes.length });
}

function parseCsvToNoteObjects(text: string): Array<Record<string, string>> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new ValidationError("Le CSV doit contenir un en-tête et au moins une ligne");
  const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const fields = line.split(/[,;]/).map((f) => f.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = fields[i] ?? ""; });
    return row;
  });
}

export async function sync(req: AuthenticatedRequest, res: Response) {
  const { notes } = req.body as { notes?: Array<{ id: string; title: string; content: string; updatedAt: string; pinned?: boolean }> };
  if (!Array.isArray(notes)) throw new ValidationError("notes[] requis");
  if (notes.length > 200) throw new ValidationError("Trop de notes à synchroniser (max 200)");
  const result = syncNotes(req.user!.uid, notes);
  res.status(200).json(result);
}
