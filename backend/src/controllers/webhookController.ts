import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { getEffectiveEntitlementsForUid } from "../services/teamService";
import {
  listWebhooks,
  upsertWebhook,
  deleteWebhook,
  testWebhook,
} from "../services/webhookService";
import { ForbiddenError, ValidationError } from "../utils/errors";

function assertIntegrationsEntitled(uid: string, email: string): void {
  if (!getEffectiveEntitlementsForUid(uid, email).integrations) {
    throw new ForbiddenError(
      "Les webhooks et intégrations nécessitent le palier Small teams ou le statut early bird (attribué par un administrateur).",
    );
  }
}

function parseIdList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
  return ids;
}

export async function getWebhooks(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitled(req.user!.uid, req.user!.email);
  const list = listWebhooks(req.user!.uid);
  res.status(200).json(list);
}

export async function postUpsertWebhook(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitled(req.user!.uid, req.user!.email);
  const { id, label, url, platform, events, enabled, projectIds, teamIds } = req.body as Record<string, unknown>;

  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    throw new ValidationError("URL de webhook invalide");
  }

  const config = await upsertWebhook(req.user!.uid, {
    id: typeof id === "string" ? id : undefined,
    label: typeof label === "string" ? label : "Webhook",
    url: url as string,
    platform: (platform as string) || "custom",
    events: Array.isArray(events) ? events : [],
    enabled: typeof enabled === "boolean" ? enabled : true,
    projectIds: parseIdList(projectIds),
    teamIds: parseIdList(teamIds),
  } as Parameters<typeof upsertWebhook>[1]);

  res.status(200).json(config);
}

export async function postDeleteWebhook(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitled(req.user!.uid, req.user!.email);
  const webhookId = req.params.id as string;
  if (!webhookId) throw new ValidationError("ID requis");
  deleteWebhook(req.user!.uid, webhookId);
  res.status(200).json({ ok: true });
}

export async function postTestWebhook(req: AuthenticatedRequest, res: Response) {
  assertIntegrationsEntitled(req.user!.uid, req.user!.email);
  const { url, platform, webhookId } = req.body as { url?: string; platform?: string; webhookId?: string };
  if (!url || typeof url !== "string" || !url.startsWith("http")) {
    throw new ValidationError("URL de webhook invalide");
  }

  const success = await testWebhook(url, (platform as Parameters<typeof testWebhook>[1]) || "custom", {
    uid: req.user!.uid,
    webhookId: typeof webhookId === "string" ? webhookId : undefined,
  });
  res.status(200).json({ success });
}
