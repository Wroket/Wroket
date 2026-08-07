import type { AuthUser } from "../authService";
import {
  createNote,
  getNote,
  listNotes,
  listNotesByTodo,
  updateNote,
  type Note,
} from "../noteService";
import type { McpToolDef, McpToolHandler } from "./types";
import { clampLimit, optionalString, requireString } from "./types";

function leanNote(n: Note, includeContent: boolean): Record<string, unknown> {
  return {
    id: n.id,
    title: n.title,
    ...(includeContent ? { content: n.content } : { contentPreview: (n.content ?? "").slice(0, 200) }),
    pinned: n.pinned,
    folder: n.folder ?? null,
    tags: n.tags ?? [],
    todoId: n.todoId ?? null,
    projectId: n.projectId ?? null,
    updatedAt: n.updatedAt,
    createdAt: n.createdAt,
  };
}

export const noteToolDefs: McpToolDef[] = [
  {
    name: "list_notes",
    description: "List notes owned by the user. Optional filter by todoId.",
    requiredScope: "notes:read",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string" },
        limit: { type: "number", description: "Max items (default 50, max 200)" },
      },
    },
  },
  {
    name: "get_note",
    description: "Get a note by id (full content).",
    requiredScope: "notes:read",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "create_note",
    description: "Create a note. Optional link to todoId / projectId.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        todoId: { type: "string" },
        projectId: { type: "string" },
        folder: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "update_note",
    description: "Update note title, content, tags, or links.",
    requiredScope: "notes:write",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        content: { type: "string" },
        pinned: { type: "boolean" },
        folder: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        todoId: { type: ["string", "null"] },
        projectId: { type: ["string", "null"] },
      },
      required: ["id"],
    },
  },
];

function listNotesHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = optionalString(args, "todoId");
  const notes = todoId ? listNotesByTodo(user.uid, todoId) : listNotes(user.uid);
  const limit = clampLimit(args.limit);
  return {
    notes: notes.slice(0, limit).map((n) => leanNote(n, false)),
    total: notes.length,
  };
}

function getNoteHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  return leanNote(getNote(user.uid, id), true);
}

function createNoteHandler(user: AuthUser, args: Record<string, unknown>) {
  const tags = Array.isArray(args.tags)
    ? args.tags.filter((t): t is string => typeof t === "string")
    : undefined;
  const note = createNote(user.uid, {
    title: typeof args.title === "string" ? args.title : undefined,
    content: typeof args.content === "string" ? args.content : undefined,
    todoId: optionalString(args, "todoId"),
    projectId: optionalString(args, "projectId"),
    folder: optionalString(args, "folder"),
    tags,
  });
  return leanNote(note, true);
}

function updateNoteHandler(user: AuthUser, args: Record<string, unknown>) {
  const id = requireString(args, "id");
  const patch: Parameters<typeof updateNote>[2] = {};
  if (typeof args.title === "string") patch.title = args.title;
  if (typeof args.content === "string") patch.content = args.content;
  if (typeof args.pinned === "boolean") patch.pinned = args.pinned;
  if (typeof args.folder === "string") patch.folder = args.folder;
  if (Array.isArray(args.tags)) {
    patch.tags = args.tags.filter((t): t is string => typeof t === "string");
  }
  if (args.todoId === null) patch.todoId = null;
  else if (typeof args.todoId === "string") patch.todoId = args.todoId;
  if (args.projectId === null) patch.projectId = null;
  else if (typeof args.projectId === "string") patch.projectId = args.projectId;
  return leanNote(updateNote(user.uid, id, patch), true);
}

export const noteHandlers: Record<string, McpToolHandler> = {
  list_notes: listNotesHandler,
  get_note: getNoteHandler,
  create_note: createNoteHandler,
  update_note: updateNoteHandler,
};
