import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { getAdminStats, getAdminUsers, getInviteLog } from "../services/adminService";
import { getActivityLog } from "../services/activityLogService";
import { getActiveSessions, countGoogleCalendarConnected } from "../services/authService";
import { getWebhooksOverview } from "../services/webhookService";
import { exportUserData, deleteUserData } from "../services/rgpdService";
import { getStore } from "../persistence";

export async function adminStats(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json(getAdminStats());
}

export async function adminUsers(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json(getAdminUsers());
}

export async function adminInviteLog(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json(getInviteLog());
}

const MAX_ACTIVITY_LIMIT = 500;

export async function adminActivity(req: AuthenticatedRequest, res: Response) {
  const { userId, entityType, limit, offset } = req.query as Record<string, string | undefined>;
  const parsedLimit = limit ? parseInt(limit, 10) : 50;
  const parsedOffset = offset ? parseInt(offset, 10) : 0;
  const result = getActivityLog({
    userId: userId || undefined,
    entityType: entityType || undefined,
    limit: Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 50, MAX_ACTIVITY_LIMIT),
    offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
  });
  res.status(200).json(result);
}

export async function adminSessions(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json(getActiveSessions());
}

export async function adminIntegrations(_req: AuthenticatedRequest, res: Response) {
  res.status(200).json({
    webhooks: getWebhooksOverview(),
    googleCalendarConnected: countGoogleCalendarConnected(),
  });
}

export async function adminUserExport(req: AuthenticatedRequest, res: Response) {
  const uid = req.params.uid as string;
  const data = exportUserData(uid);
  res.status(200).json(data);
}

export async function adminUserDelete(req: AuthenticatedRequest, res: Response) {
  const uid = req.params.uid as string;
  await deleteUserData(uid);
  res.status(204).end();
}

export async function adminCompletionRates(_req: AuthenticatedRequest, res: Response) {
  const users = getAdminUsers();
  const todoStore = (getStore().todos ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const EXCLUDED = new Set(["cancelled", "deleted"]);

  const rates = users.map((u) => {
    const userTodos = todoStore[u.uid] ?? {};
    let total = 0;
    let completed = 0;
    for (const todo of Object.values(userTodos)) {
      if (EXCLUDED.has(todo.status as string)) continue;
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

  res.status(200).json(rates);
}
