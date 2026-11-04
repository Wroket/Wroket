import { Response } from "express";

import { AuthenticatedRequest } from "./authController";

const subscribersByUid = new Map<string, Set<Response>>();

/**
 * Push a real-time invalidation event to any active SSE streams for `uid`.
 */
export function emitUserSyncEvent(
  uid: string,
  payload: { type: string; tool?: string; channel?: string; t?: number },
): void {
  const subs = subscribersByUid.get(uid);
  if (!subs || subs.size === 0) return;
  const frame = `data: ${JSON.stringify({ ...payload, t: payload.t ?? Date.now() })}\n\n`;
  for (const res of subs) {
    try {
      res.write(frame);
    } catch {
      subs.delete(res);
    }
  }
}

/**
 * Server-Sent Events stream for cross-device and MCP agent invalidation.
 * Requires session cookie (same as other API routes). Sends periodic ping frames
 * and immediate mutation events when MCP tools or background jobs mutate user data.
 */
export function streamUserSync(req: AuthenticatedRequest, res: Response): void {
  const uid = req.user?.uid;
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const resWithFlush = res as Response & { flushHeaders?: () => void };
  resWithFlush.flushHeaders?.();

  if (uid) {
    let subs = subscribersByUid.get(uid);
    if (!subs) {
      subs = new Set<Response>();
      subscribersByUid.set(uid, subs);
    }
    subs.add(res);
  }

  res.write("retry: 30000\n");
  res.write(`: ok ${Date.now()}\n\n`);

  const iv = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: "ping", t: Date.now() })}\n\n`);
    } catch {
      clearInterval(iv);
    }
  }, 45_000);

  const stop = () => {
    clearInterval(iv);
    if (uid) {
      const subs = subscribersByUid.get(uid);
      if (subs) {
        subs.delete(res);
        if (subs.size === 0) subscribersByUid.delete(uid);
      }
    }
  };
  req.on("close", stop);
  res.on("close", stop);
}
