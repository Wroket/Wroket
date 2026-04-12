import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Request-ID middleware.
 *
 * Why: when an error is returned to the client we need a way to correlate the
 * client-visible error with the server-side log line. Without an ID the only
 * clue is the timestamp, which is unreliable under load. This middleware:
 *
 *   • Generates a short random hex ID for every incoming request.
 *   • Echoes it back to the client as `X-Request-Id` so the frontend (or a
 *     support engineer) can paste it straight into the log search.
 *   • Attaches it to `req` so the errorHandler and any logger call can include
 *     it in the log entry without threading it through every function signature.
 *
 * Register it early in app.ts (before helmet and routes) so the ID is available
 * everywhere and error responses still include `X-Request-Id`.
 */

export interface RequestWithId extends Request {
  id: string;
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  (req as RequestWithId).id = crypto.randomBytes(8).toString("hex");
  res.setHeader("X-Request-Id", (req as RequestWithId).id);
  next();
}
