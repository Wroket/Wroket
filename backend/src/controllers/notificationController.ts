import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
} from "../services/notificationService";

export async function list(req: AuthenticatedRequest, res: Response) {
  const notifications = listNotifications(req.user!.uid);
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
