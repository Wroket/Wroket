import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  getWebPushEnabled,
  removePushSubscriptions,
  upsertPushSubscription,
} from "../services/pushSubscriptionService";
import { getVapidPublicKey } from "../services/webPushService";
import { ValidationError } from "../utils/errors";

export async function getVapidKey(_req: AuthenticatedRequest, res: Response) {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({ message: "Web Push non configuré sur ce serveur" });
    return;
  }
  res.status(200).json({ publicKey });
}

export async function subscribe(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const { subscription } = req.body as { subscription?: unknown };
  if (!subscription) throw new ValidationError("subscription requis");

  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  const stored = upsertPushSubscription(uid, subscription, ua);
  res.status(200).json({ ok: true, endpoint: stored.endpoint, webPushEnabled: true });
}

export async function unsubscribe(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const { endpoint } = req.body as { endpoint?: unknown };
  const ep = typeof endpoint === "string" && endpoint.trim() ? endpoint.trim() : undefined;
  const removed = removePushSubscriptions(uid, ep);
  res.status(200).json({ ok: true, removed, webPushEnabled: getWebPushEnabled(uid) });
}
