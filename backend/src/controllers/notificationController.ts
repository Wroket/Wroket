import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listNotifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
} from "../services/notificationService";

export async function list(req: AuthenticatedRequest, res: Response) {
  try {
    const notifications = listNotifications(req.user!.uid);
    res.status(200).json(notifications);
  } catch (err) {
    console.error("[notif.list]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function count(req: AuthenticatedRequest, res: Response) {
  try {
    const c = unreadCount(req.user!.uid);
    res.status(200).json({ count: c });
  } catch (err) {
    console.error("[notif.count]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}

export async function read(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const notif = markAsRead(req.user!.uid, id);
    res.status(200).json(notif);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    res.status(404).json({ message });
  }
}

export async function readAll(req: AuthenticatedRequest, res: Response) {
  try {
    markAllAsRead(req.user!.uid);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[notif.readAll]", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
}
