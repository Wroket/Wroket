import crypto from "crypto";

import { normalizeEmail } from "./authService";
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

function commentToPersisted(c: Comment): Comment {
  return { ...c };
}

function persist(): void {
  const obj: Record<string, Comment[]> = {};
  commentsByTodo.forEach((list, todoId) => {
    obj[todoId] = list.map((c) => commentToPersisted(c));
  });
  const store = getStore();
  store.comments = obj;
  scheduleSave("comments");
}

(function hydrate() {
  const store = getStore();
  if (store.comments) {
    for (const [todoId, list] of Object.entries(store.comments)) {
      const cleaned = (list as Comment[]).map((c) => {
        const { encV1: _e, ...rest } = c as Comment & { encV1?: string };
        return rest as Comment;
      });
      commentsByTodo.set(todoId, cleaned);
    }
    console.log("[comments] chargés pour %d tâche(s)", commentsByTodo.size);
  }
})();

/** Comments authored by user (for self-service GDPR export). */
export function exportCommentsByAuthor(userId: string): Comment[] {
  const out: Comment[] = [];
  commentsByTodo.forEach((list) => {
    for (const c of list) {
      if (c.userId === userId) out.push({ ...c });
    }
  });
  return out;
}

export function listComments(todoId: string): Comment[] {
  return commentsByTodo.get(todoId) ?? [];
}

/** Remove all comments for one or more todos (e.g. phase→sub-project conversion purges root tasks). */
export function removeCommentsForTodos(todoIds: string[]): void {
  let changed = false;
  for (const id of todoIds) {
    if (commentsByTodo.has(id)) {
      commentsByTodo.delete(id);
      changed = true;
    }
  }
  if (changed) persist();
}

/**
 * Returns comment counts for a list of todo IDs.
 */
export function getCommentCounts(todoIds: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const id of todoIds) {
    const count = commentsByTodo.get(id)?.length ?? 0;
    if (count > 0) result[id] = count;
  }
  return result;
}

export function addComment(todoId: string, userId: string, userEmail: string, text: string): Comment {
  const trimmed = text.trim();
  if (!trimmed) throw new ValidationError("Le commentaire ne peut pas être vide");
  if (trimmed.length > 2000) throw new ValidationError("Commentaire trop long (max 2000 caractères)");

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

/**
 * Extract emails from Wroket mention syntax: `@local@domain.tld` (one leading @, email contains @).
 * Normalizes with {@link normalizeEmail} for lookup via {@link findUserByEmail}.
 */
export function parseMentions(text: string): string[] {
  // Require a real TLD (at least 2 letters) so we don't match truncated `@user@host` while typing.
  const re = /@([a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const e = normalizeEmail(m[1]);
    if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out;
}

/** Emails newly mentioned in `newText` vs `oldText` (for edit: avoid re-notifying). */
export function newMentionsOnly(oldText: string, newText: string): string[] {
  const before = new Set(parseMentions(oldText));
  return parseMentions(newText).filter((e) => !before.has(e));
}
