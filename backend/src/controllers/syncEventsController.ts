import { Response } from "express";

import { AuthenticatedRequest } from "./authController";

/**
 * SPIKE: Server-Sent Events stream for future cross-device invalidation.
 * Requires session cookie (same as other API routes). Sends periodic ping frames;
 * no Firestore wiring yet — proves long-lived response on Cloud Run behind proxies.
 *
 * Client wiring (EventSource + cross-origin credentials) is intentionally deferred.
 */
export function streamUserSync(req: AuthenticatedRequest, res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const resWithFlush = res as Response & { flushHeaders?: () => void };
  resWithFlush.flushHeaders?.();

  res.write("retry: 30000\n");
  res.write(`: ok ${Date.now()}\n\n`);

  const iv = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: "ping", t: Date.now() })}\n\n`);
    } catch {
      clearInterval(iv);
    }
  }, 45_000);

  const stop = () => clearInterval(iv);
  req.on("close", stop);
  res.on("close", stop);
}
