import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  type Notification,
} from "../services/notificationService";
import { findTodoForUser } from "../services/todoService";
import { canViewNote } from "../services/noteService";

/** Refresh quoted task titles in messages from the current todo (read-only; not persisted). */
function replaceTodoTitleInMessage(message: string, prev: string, cur: string): string {
  if (!prev || prev === cur) return message;
  let m = message;
  if (m.includes(`"${prev}"`)) m = m.split(`"${prev}"`).join(`"${cur}"`);
  if (m.includes(`« ${prev} »`)) m = m.split(`« ${prev} »`).join(`« ${cur} »`);
  return m;
}

function enrichNotificationsForDisplay(userId: string, list: Notification[]): Notification[] {
  const todoIds = [...new Set(list.map((n) => n.data?.todoId).filter((x): x is string => Boolean(x)))];
  const titleById = new Map<string, string>();
  for (const tid of todoIds) {
    const found = findTodoForUser(userId, tid);
    if (found) titleById.set(tid, found.todo.title.trim());
  }
  return list.map((n) => {
    const tid = n.data?.todoId;
    if (!tid) return n;
    const cur = titleById.get(tid);
    if (cur === undefined) return n;
    if (!cur) return n;
    const prev = (n.data?.todoTitle ?? "").trim();
    const message = replaceTodoTitleInMessage(n.message, prev, cur);
    const data: Record<string, string> = { ...(n.data ?? {}), todoTitle: cur };
    if (message === n.message && prev === cur) return n;
    return { ...n, message, data };
  });
}

export async function list(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const userEmail = req.user!.email;
  const raw = listNotifications(uid);
  let notifications = enrichNotificationsForDisplay(uid, raw);

  // For note_mention notifications, flag those whose note is no longer accessible
  if (userEmail) {
    notifications = notifications.map((n) => {
      if (n.type !== "note_mention" || !n.data?.noteId) return n;
      try {
        const accessible = canViewNote(uid, userEmail, n.data.noteId);
        if (accessible) return n;
        return { ...n, data: { ...n.data, noteAccessible: "false" } };
      } catch {
        return n;
      }
    });
  }

  res.status(200).json(notifications);
}

export async function count(req: AuthenticatedRequest, res: Response) {
  const c = unreadCount(req.user!.uid);
  res.status(200).json({ count: c });
}

export async function read(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const notif = markAsRead(req.user!.uid, id);
  res.status(200).json(notif);
}

export async function readAll(req: AuthenticatedRequest, res: Response) {
  markAllAsRead(req.user!.uid);
  res.status(200).json({ ok: true });
}
