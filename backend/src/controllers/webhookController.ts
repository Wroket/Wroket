import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listWebhooks,
  upsertWebhook,
  deleteWebhook,
  testWebhook,
} from "../services/webhookService";
import { ValidationError } from "../utils/errors";

export async function getWebhooks(req: AuthenticatedRequest, res: Response) {
  const list = listWebhooks(req.user!.uid);
  res.status(200).json(list);
}

export async function postUpsertWebhook(req: AuthenticatedRequest, res: Response) {
  const { id, label, url, platform, events, enabled } = req.body as Record<string, unknown>;

  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    throw new ValidationError("URL de webhook invalide");
  }

  const config = upsertWebhook(req.user!.uid, {
    id: typeof id === "string" ? id : undefined,
    label: typeof label === "string" ? label : "Webhook",
    url: url as string,
    platform: (platform as string) || "custom",
    events: Array.isArray(events) ? events : [],
    enabled: typeof enabled === "boolean" ? enabled : true,
  } as Parameters<typeof upsertWebhook>[1]);

  res.status(200).json(config);
}

export async function postDeleteWebhook(req: AuthenticatedRequest, res: Response) {
  const webhookId = req.params.id as string;
  if (!webhookId) throw new ValidationError("ID requis");
  deleteWebhook(req.user!.uid, webhookId);
  res.status(200).json({ ok: true });
}

export async function postTestWebhook(req: AuthenticatedRequest, res: Response) {
  const { url, platform } = req.body as { url?: string; platform?: string };
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    throw new ValidationError("URL de webhook invalide");
  }

  const success = await testWebhook(url, (platform as Parameters<typeof testWebhook>[1]) || "custom");
  res.status(200).json({ success });
}
