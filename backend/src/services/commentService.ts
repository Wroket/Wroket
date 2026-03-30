import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError } from "../utils/errors";

export interface Comment {
  id: string;
  todoId: string;
  userId: string;
  userEmail: string;
  text: string;
  createdAt: string;
}

const commentsByTodo = new Map<string, Comment[]>();

function persist(): void {
  const obj: Record<string, Comment[]> = {};
  commentsByTodo.forEach((list, todoId) => { obj[todoId] = list; });
  const store = getStore();
  store.comments = obj;
  scheduleSave("comments");
}

(function hydrate() {
  const store = getStore();
  if (store.comments) {
    for (const [todoId, list] of Object.entries(store.comments)) {
      commentsByTodo.set(todoId, list as Comment[]);
    }
    console.log("[comments] chargés pour %d tâche(s)", commentsByTodo.size);
  }
})();

export function listComments(todoId: string): Comment[] {
  return commentsByTodo.get(todoId) ?? [];
}

export function addComment(todoId: string, userId: string, userEmail: string, text: string): Comment {
  const trimmed = text.trim();
  if (!trimmed) throw new NotFoundError("Le commentaire ne peut pas être vide");
  if (trimmed.length > 2000) throw new NotFoundError("Commentaire trop long (max 2000 caractères)");

  const comment: Comment = {
    id: crypto.randomUUID(),
    todoId,
    userId,
    userEmail,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };

  let list = commentsByTodo.get(todoId);
  if (!list) {
    list = [];
    commentsByTodo.set(todoId, list);
  }
  list.push(comment);
  persist();
  return comment;
}

export function deleteComment(todoId: string, commentId: string, userId: string): void {
  const list = commentsByTodo.get(todoId);
  if (!list) throw new NotFoundError("Commentaire introuvable");
  const idx = list.findIndex((c) => c.id === commentId);
  if (idx === -1) throw new NotFoundError("Commentaire introuvable");
  if (list[idx].userId !== userId) throw new NotFoundError("Non autorisé");
  list.splice(idx, 1);
  persist();
}

export function countComments(todoId: string): number {
  return (commentsByTodo.get(todoId) ?? []).length;
}
