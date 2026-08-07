/**
 * Discord Interactions HTTP endpoint (PING + slash + components).
 * Expects raw body Buffer for Ed25519 verification.
 */

import { Request, Response } from "express";

import {
  isDiscordSigningConfigured,
  verifyDiscordRequest,
} from "../services/discordSignature";
import {
  discordSlashHelp,
  handleDiscordCommandText,
  parseDiscordCustomId,
  resolveWroketUserFromDiscord,
  runDiscordTaskAction,
} from "../services/discordInteractService";

function rawBodyToString(body: unknown): string {
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  if (body && typeof body === "object") return JSON.stringify(body);
  return "";
}

/**
 * POST /integrations/discord/interactions
 */
export async function postDiscordInteractions(req: Request, res: Response): Promise<void> {
  if (!isDiscordSigningConfigured()) {
    res.status(503).json({ error: "discord_signing_not_configured" });
    return;
  }

  const raw = rawBodyToString(req.body);
  const ok = verifyDiscordRequest({
    headers: {
      signature: req.header("x-signature-ed25519") ?? undefined,
      timestamp: req.header("x-signature-timestamp") ?? undefined,
    },
    rawBody: raw,
  });
  if (!ok) {
    res.status(401).json({ error: "invalid_discord_signature" });
    return;
  }

  let payload: {
    type?: number;
    data?: {
      name?: string;
      options?: Array<{ name?: string; value?: string | number }>;
      custom_id?: string;
    };
    member?: { user?: { id?: string; email?: string } };
    user?: { id?: string; email?: string };
  };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    res.status(400).json({ error: "invalid_json" });
    return;
  }

  // PING
  if (payload.type === 1) {
    res.status(200).json({ type: 1 });
    return;
  }

  const discordUserId = payload.member?.user?.id ?? payload.user?.id ?? "";
  const email = payload.member?.user?.email ?? payload.user?.email ?? null;

  // APPLICATION_COMMAND (2)
  if (payload.type === 2) {
    const name = (payload.data?.name ?? "").toLowerCase();
    const opts = payload.data?.options ?? [];
    const sub =
      opts.find((o) => o.name === "command" || o.name === "text")?.value ??
      opts.map((o) => o.value).filter(Boolean).join(" ");
    let text = typeof sub === "string" ? sub : String(sub ?? "");
    if (name === "wroket" && !text) text = "help";
    else if (name !== "wroket") text = [name, text].filter(Boolean).join(" ");

    const resolved = await resolveWroketUserFromDiscord({ discordUserId, email });
    if ("error" in resolved) {
      res.status(200).json({ type: 4, data: { content: resolved.error, flags: 64 } });
      return;
    }
    try {
      const reply = await handleDiscordCommandText({ actorUid: resolved.uid, text });
      res.status(200).json({
        type: 4,
        data: { content: reply || discordSlashHelp(), flags: 64 },
      });
    } catch (err) {
      console.warn("[discord] slash failed:", err);
      res.status(200).json({
        type: 4,
        data: { content: "Erreur lors du traitement de la commande.", flags: 64 },
      });
    }
    return;
  }

  // MESSAGE_COMPONENT (3)
  if (payload.type === 3) {
    const parsed = parseDiscordCustomId(payload.data?.custom_id);
    if (!parsed) {
      res.status(200).json({
        type: 4,
        data: { content: "Action Wroket non reconnue.", flags: 64 },
      });
      return;
    }
    const resolved = await resolveWroketUserFromDiscord({ discordUserId, email });
    if ("error" in resolved) {
      res.status(200).json({ type: 4, data: { content: resolved.error, flags: 64 } });
      return;
    }
    const result = await runDiscordTaskAction({
      actorUid: resolved.uid,
      targetUid: parsed.targetUid,
      todoId: parsed.todoId,
      action: parsed.action,
    });
    res.status(200).json({
      type: 4,
      data: { content: result.message, flags: 64 },
    });
    return;
  }

  res.status(200).json({ type: 4, data: { content: "Ignoré", flags: 64 } });
}
