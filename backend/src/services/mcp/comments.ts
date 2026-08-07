import type { AuthUser } from "../authService";
import { addComment, listComments, type Comment } from "../commentService";
import { findTodoForUser } from "../todoService";
import { NotFoundError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { requireString } from "./types";

function leanComment(c: Comment): Record<string, unknown> {
  return {
    id: c.id,
    todoId: c.todoId,
    userEmail: c.userEmail,
    text: c.text,
    createdAt: c.createdAt,
    editedAt: c.editedAt ?? null,
  };
}

async function assertTodoAccess(user: AuthUser, todoId: string): Promise<void> {
  const found = await findTodoForUser(user.uid, todoId);
  if (!found || found.todo.status === "deleted") throw new NotFoundError("Tâche introuvable");
}

export const commentToolDefs: McpToolDef[] = [
  {
    name: "list_comments",
    description: "List comments on a task.",
    requiredScope: "todos:read",
    inputSchema: {
      type: "object",
      properties: { todoId: { type: "string" } },
      required: ["todoId"],
    },
  },
  {
    name: "add_comment",
    description: "Add a comment on a task (max 2000 chars).",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string" },
        text: { type: "string" },
      },
      required: ["todoId", "text"],
    },
  },
];

async function listCommentsHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  await assertTodoAccess(user, todoId);
  return { todoId, comments: listComments(todoId).map(leanComment) };
}

async function addCommentHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const text = requireString(args, "text");
  await assertTodoAccess(user, todoId);
  return leanComment(addComment(todoId, user.uid, user.email, text));
}

export const commentHandlers: Record<string, McpToolHandler> = {
  list_comments: listCommentsHandler,
  add_comment: addCommentHandler,
};
