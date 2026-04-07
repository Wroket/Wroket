import crypto from "crypto";

import { isKekConfigured } from "../crypto/kekService";
import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { getTodoStoreOwnerId } from "./todoService";
import { decryptCommentText, encryptCommentText, ensureUserWrappedDek } from "./userDekService";

export interface Comment {
  id: string;
  todoId: string;
  userId: string;
  userEmail: string;
  text: string;
  createdAt: string;
  editedAt?: string;
  reactions?: Record<string, string[]>;
  /** Ciphertext for text when CRYPTO_KEK_BASE64 is set (task owner DEK). */
  encV1?: string;
}

const commentsByTodo = new Map<string, Comment[]>();

function decodeCommentInMemory(todoId: string, c: Comment): Comment {
  const enc = c.encV1;
  if (typeof enc === "string" && enc.length > 0 && isKekConfigured()) {
    const owner = getTodoStoreOwnerId(todoId);
    if (!owner) {
      const { encV1: _e, ...rest } = c;
      return { ...rest, text: "[commentaire illisible]" };
    }
    try {
      ensureUserWrappedDek(owner);
      const text = decryptCommentText(owner, enc);
      const { encV1: _e, ...rest } = c;
      return { ...rest, text };
    } catch (err) {
      console.error("[comments] decrypt failed todoId=%s: %s", todoId, err);
      const { encV1: _e, ...rest } = c;
      return { ...rest, text: "[chiffrement indisponible]" };
    }
  }
  const { encV1: _e, ...rest } = c;
  return rest as Comment;
}

function commentToPersisted(c: Comment, todoId: string): Comment {
  const { encV1: _strip, ...withoutEnc } = c;
  if (!isKekConfigured()) {
    return { ...withoutEnc };
  }
  const owner = getTodoStoreOwnerId(todoId);
  if (!owner) {
    return { ...withoutEnc };
  }
  ensureUserWrappedDek(owner);
  const encV1 = encryptCommentText(owner, c.text);
  return {
    ...withoutEnc,
    text: "",
    encV1,
  };
}

function persist(): void {
  const obj: Record<string, Comment[]> = {};
  commentsByTodo.forEach((list, todoId) => {
    obj[todoId] = list.map((c) => commentToPersisted(c, todoId));
  });
  const store = getStore();
  store.comments = obj;
  scheduleSave("comments");
}

(function hydrate() {
  const store = getStore();
  if (store.comments) {
    for (const [todoId, list] of Object.entries(store.comments)) {
      const decoded = (list as Comment[]).map((c) => decodeCommentInMemory(todoId, c));
      commentsByTodo.set(todoId, decoded);
    }
    console.log("[comments] chargés pour %d tâche(s)", commentsByTodo.size);
  }
})();

/** Comments authored by user (decrypted in-memory), for self-service GDPR export. */
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

export function parseMentions(text: string): string[] {
  const matches = text.match(/@([\w.+-]+@[\w.-]+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

