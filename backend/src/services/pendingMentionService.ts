import crypto from "crypto";

import { findUserByEmail, findUserByUid, normalizeEmail } from "./authService";
import { listComments } from "./commentService";
import { createNotification } from "./notificationService";
import { findTodoForUser } from "./todoService";
import { getStore, scheduleSave } from "../persistence";

export interface PendingCommentMention {
  id: string;
  inviterUid: string;
  inviteeEmail: string;
  todoId: string;
  commentId: string;
  createdAt: string;
}

const list: PendingCommentMention[] = [];

function persist(): void {
  const store = getStore();
  store.pendingCommentMentions = [...list];
  scheduleSave("pendingCommentMentions");
}

function hydratePendingMentionsFromStore(): void {
  const raw = getStore().pendingCommentMentions;
  if (!Array.isArray(raw) || raw.length === 0) return;
  list.length = 0;
  for (const row of raw) {
    if (row && typeof row === "object" && "inviterUid" in row && "inviteeEmail" in row && "todoId" in row && "commentId" in row) {
      list.push(row as PendingCommentMention);
    }
  }
  console.log("[pendingMentions] %d entrée(s) chargée(s)", list.length);
}

(function hydrate() {
  hydratePendingMentionsFromStore();
})();

/**
 * When a user is mentioned but is not an active collaborator of the author, we queue a
 * notification until they accept collaboration (or are already delivered on flush).
 */
export function enqueuePendingMention(
  inviterUid: string,
  inviteeEmail: string,
  todoId: string,
  commentId: string,
): void {
  const inviteeNorm = normalizeEmail(inviteeEmail);
  if (
    list.some(
      (p) =>
        p.inviterUid === inviterUid &&
        p.inviteeEmail === inviteeNorm &&
        p.todoId === todoId &&
        p.commentId === commentId,
    )
  ) {
    return;
  }
  list.push({
    id: crypto.randomUUID(),
    inviterUid,
    inviteeEmail: inviteeNorm,
    todoId,
    commentId,
    createdAt: new Date().toISOString(),
  });
  if (list.length > 5000) list.splice(0, list.length - 5000);
  persist();
}

/**
 * Called after the invitee accepts collaboration with inviter — deliver all queued mention notifications.
 */
export function deliverPendingMentionsAfterCollaborationAccepted(inviterUid: string, inviteeEmail: string): void {
  const inviteeNorm = normalizeEmail(inviteeEmail);
  const toDeliver: PendingCommentMention[] = [];
  const rest: PendingCommentMention[] = [];
  for (const p of list) {
    if (p.inviterUid === inviterUid && p.inviteeEmail === inviteeNorm) {
      toDeliver.push(p);
    } else {
      rest.push(p);
    }
  }
  if (toDeliver.length === 0) return;
  list.length = 0;
  list.push(...rest);
  persist();

  const user = findUserByEmail(inviteeNorm);
  if (!user) return;

  const inviter = findUserByUid(inviterUid);
  const inviterLabel = inviter?.email ?? "Quelqu'un";

  for (const p of toDeliver) {
    try {
      const todoCtx = findTodoForUser(inviterUid, p.todoId);
      const todoTitle = todoCtx?.todo.title ?? "Tâche";
      const comments = listComments(p.todoId);
      const c = comments.find((x) => x.id === p.commentId);
      const preview = (c?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
      createNotification(
        user.uid,
        "comment_mention",
        "Mention dans un commentaire",
        `${inviterLabel} vous a mentionné dans un commentaire sur « ${todoTitle} »`,
        {
          todoId: p.todoId,
          todoTitle,
          actorEmail: inviter?.email ?? "",
          commentPreview: preview,
        },
      );
    } catch (err) {
      console.warn("[pendingMentions] notification failed:", err);
    }
  }
}
