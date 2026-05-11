import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { getAdminStats, getAdminUsers, getInviteLog } from "../services/adminService";
import { getActivityLog, logActivity } from "../services/activityLogService";
import {
  findUserByUid,
  getActiveSessions,
  countGoogleCalendarConnected,
  countMicrosoftCalendarConnected,
  getBillingPlanForUid,
  getStripeCustomerIdForUid,
  setBillingPlanForUid,
  setEarlyBirdForUid,
} from "../services/authService";
import { normalizeBillingPlan } from "../services/entitlementsService";
import { createBillingPortalSessionUrl } from "../services/stripePortalSessionService";
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
  const rawOffset = Number.isFinite(parsedOffset) ? parsedOffset : 0;
  const result = getActivityLog({
    userId: userId || undefined,
    entityType: entityType || undefined,
    limit: Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 50, MAX_ACTIVITY_LIMIT),
    offset: Math.max(0, rawOffset),
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
    microsoftCalendarConnected: countMicrosoftCalendarConnected(),
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

export async function adminUserBillingPortalSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const targetUid = req.params.uid as string;
  const target = findUserByUid(targetUid);
  if (!target) {
    res.status(404).json({ message: "Utilisateur introuvable." });
    return;
  }

  const customerId = getStripeCustomerIdForUid(targetUid);
  if (!customerId) {
    res.status(404).json({
      message: "Aucun client Stripe lié à ce compte. L’utilisateur doit d’abord finaliser un paiement via Checkout.",
    });
    return;
  }

  const result = await createBillingPortalSessionUrl(customerId, req.body);
  if ("error" in result) {
    res.status(result.status).json({
      message: result.error,
      ...(result.detail ? { detail: result.detail } : {}),
    });
    return;
  }

  logActivity(req.user!.uid, req.user!.email ?? "", "admin_billing_portal", "user", targetUid, {
    targetEmail: target.email,
  });
  res.status(200).json({ url: result.url });
}

export async function adminUserBillingPlanPatch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const targetUid = req.params.uid as string;
  const target = findUserByUid(targetUid);
  if (!target) {
    res.status(404).json({ message: "Utilisateur introuvable." });
    return;
  }

  const body = req.body as Record<string, unknown> | null;
  const planRaw = body?.plan;
  const reasonRaw = body?.reason;
  const plan = normalizeBillingPlan(typeof planRaw === "string" ? planRaw : undefined);
  if (!plan) {
    res.status(400).json({ message: "Plan invalide. Valeurs acceptées : free, first, small, large." });
    return;
  }

  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (reason.length < 3) {
    res.status(400).json({
      message: "Indiquez une raison d’au moins 3 caractères (audit support).",
    });
    return;
  }

  const subId = target.stripeSubscriptionId?.trim();
  const st = target.stripeSubscriptionStatus?.trim().toLowerCase();
  if (subId && (st === "active" || st === "trialing")) {
    res.status(409).json({
      message:
        "Cet utilisateur a un abonnement Stripe actif ou en essai. Utilisez le portail de facturation ou le dashboard Stripe pour modifier le plan, ou résiliez l’abonnement avant un override manuel.",
    });
    return;
  }

  const fromPlan = getBillingPlanForUid(targetUid);
  if (fromPlan === plan) {
    res.status(200).json({ billingPlan: plan, unchanged: true });
    return;
  }

  setBillingPlanForUid(targetUid, plan);
  logActivity(req.user!.uid, req.user!.email ?? "", "admin_billing_plan", "user", targetUid, {
    targetEmail: target.email,
    fromPlan,
    toPlan: plan,
    reason,
  });
  res.status(200).json({ billingPlan: plan });
}

export async function adminUserEarlyBirdPatch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const targetUid = req.params.uid as string;
  const target = findUserByUid(targetUid);
  if (!target) {
    res.status(404).json({ message: "Utilisateur introuvable." });
    return;
  }

  const body = req.body as Record<string, unknown> | null;
  const reasonRaw = body?.reason;
  const ebRaw = body?.earlyBird;

  if (typeof ebRaw !== "boolean") {
    res.status(400).json({ message: "Indiquez earlyBird (booléen true ou false)." });
    return;
  }

  const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
  if (reason.length < 3) {
    res.status(400).json({
      message: "Indiquez une raison d’au moins 3 caractères (audit support).",
    });
    return;
  }

  const fromEb = !!target.earlyBird;
  if (fromEb === ebRaw) {
    res.status(200).json({ earlyBird: ebRaw, unchanged: true });
    return;
  }

  setEarlyBirdForUid(targetUid, ebRaw);
  logActivity(req.user!.uid, req.user!.email ?? "", "admin_early_bird", "user", targetUid, {
    targetEmail: target.email,
    fromEarlyBird: fromEb,
    toEarlyBird: ebRaw,
    reason,
  });
  res.status(200).json({ earlyBird: ebRaw });
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
