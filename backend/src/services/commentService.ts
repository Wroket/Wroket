import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";

export interface Comment {
  id: string;
  todoId: string;
  userId: string;
  userEmail: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  reactions?: Record<string, string[]>;
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

export function editComment(todoId: string, commentId: string, userId: string, newText: string): Comment {
  const trimmed = newText.trim();
  if (!trimmed) throw new ValidationError("Le commentaire ne peut pas être vide");
  if (trimmed.length > 2000) throw new ValidationError("Commentaire trop long (max 2000 caractères)");

  const list = commentsByTodo.get(todoId);
  if (!list) throw new NotFoundError("Commentaire introuvable");
  const comment = list.find((c) => c.id === commentId);
  if (!comment) throw new NotFoundError("Commentaire introuvable");
  if (comment.userId !== userId) throw new ForbiddenError("Non autorisé");

  comment.text = trimmed;
  comment.editedAt = new Date().toISOString();
  persist();
  return comment;
}

export function toggleReaction(todoId: string, commentId: string, userId: string, emoji: string): Comment {
  if (!emoji || emoji.length > 8) throw new ValidationError("Emoji invalide");

  const list = commentsByTodo.get(todoId);
  if (!list) throw new NotFoundError("Commentaire introuvable");
  const comment = list.find((c) => c.id === commentId);
  if (!comment) throw new NotFoundError("Commentaire introuvable");

  if (!comment.reactions) comment.reactions = {};
  const users = comment.reactions[emoji] ?? [];
  const idx = users.indexOf(userId);
  if (idx === -1) {
    users.push(userId);
  } else {
    users.splice(idx, 1);
  }
  if (users.length === 0) {
    delete comment.reactions[emoji];
  } else {
    comment.reactions[emoji] = users;
  }
  if (Object.keys(comment.reactions).length === 0) delete comment.reactions;
  persist();
  return comment;
}

export function parseMentions(text: string): string[] {
  const matches = text.match(/@([\w.+-]+@[\w.-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

export function countComments(todoId: string): number {
  return (commentsByTodo.get(todoId) ?? []).length;
}
