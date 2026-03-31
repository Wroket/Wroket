import { NextFunction, Request, Response } from "express";

import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { RequestWithId } from "./requestId";

/**
 * Improved global error handler.
 *
 * Changes vs. original:
 *
 *   1. Logs using the structured `logger` instead of bare `console.error` so
 *      every error line gets a timestamp, severity, and is JSON in production.
 *
 *   2. Includes the `requestId` in both the log entry and the JSON response
 *      body — the client can display or copy it and support can match it to
 *      the server log instantly.
 *
 *   3. Logs the stack trace only in non-production environments to avoid
 *      leaking internal paths / library versions to an attacker while still
 *      giving developers full context locally.
 *
 *   4. 5xx AppErrors (misconfigured server state) are now logged at error
 *      level; 4xx AppErrors (client mistakes) are not logged at all to
 *      avoid spamming logs with validation noise.
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const reqId = (req as RequestWithId).id;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error("AppError 5xx", {
        requestId: reqId,
        status: err.statusCode,
        message: err.message,
      });
    }
    res.status(err.statusCode).json({ message: err.message, requestId: reqId });
    return;
  }

  logger.error("Unexpected error", {
    requestId: reqId,
    error: err instanceof Error ? err.message : String(err),
    // Stack only in dev — avoids leaking internals in production
    ...(process.env.NODE_ENV !== "production" && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });

  res.status(500).json({ message: "Internal server error", requestId: reqId });
};
