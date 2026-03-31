import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { isAdmin, getAdminStats, getAdminUsers, getInviteLog } from "../services/adminService";
import { getActivityLog } from "../services/activityLogService";
import { getActiveSessions, countGoogleCalendarConnected } from "../services/authService";
import { getWebhooksOverview } from "../services/webhookService";
import { exportUserData, deleteUserData } from "../services/rgpdService";

function requireAdminCheck(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.user || !isAdmin(req.user.email)) {
    res.status(403).json({ message: "Accès refusé" });
    return false;
  }
  return true;
}

export async function adminStats(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  res.status(200).json(getAdminStats());
}

export async function adminUsers(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  res.status(200).json(getAdminUsers());
}

export async function adminInviteLog(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  res.status(200).json(getInviteLog());
}

export async function adminActivity(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  const { userId, entityType, limit, offset } = req.query as Record<string, string | undefined>;
  const result = getActivityLog({
    userId: userId || undefined,
    entityType: entityType || undefined,
    limit: limit ? parseInt(limit, 10) : 50,
    offset: offset ? parseInt(offset, 10) : 0,
  });
  res.status(200).json(result);
}

export async function adminSessions(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  res.status(200).json(getActiveSessions());
}

export async function adminIntegrations(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  res.status(200).json({
    webhooks: getWebhooksOverview(),
    googleCalendarConnected: countGoogleCalendarConnected(),
  });
}

export async function adminUserExport(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  const uid = req.params.uid as string;
  const data = exportUserData(uid);
  res.status(200).json(data);
}

export async function adminUserDelete(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  const uid = req.params.uid as string;
  deleteUserData(uid);
  res.status(204).end();
}

export async function adminCompletionRates(req: AuthenticatedRequest, res: Response) {
  if (!requireAdminCheck(req, res)) return;
  const users = getAdminUsers();
  const stats = getAdminStats();
  const todoStore = (() => {
    const { getStore } = require("../persistence");
    return (getStore().todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  })();

  const rates = users.map((u) => {
    const userTodos = todoStore[u.uid] ?? {};
    let total = 0;
    let completed = 0;
    for (const todo of Object.values(userTodos)) {
      total++;
      if (todo.status === "completed") completed++;
    }
    return {
      uid: u.uid,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      total,
      completed,
      rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  void stats;
  res.status(200).json(rates);
}
