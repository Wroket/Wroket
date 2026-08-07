import { NextFunction, Request, Response } from "express";

import { AuthenticatedRequest } from "../controllers/authController";
import {
  authenticateApiKey,
  type ApiKeyScope,
} from "../services/authService";
import { logger } from "../utils/logger";

export type ApiKeyAuthenticatedRequest = AuthenticatedRequest & {
  apiKeyId?: string;
  apiKeyScopes?: ApiKeyScope[];
};

/**
 * Require `Authorization: Bearer wrk_live_…` (session cookies ignored).
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  try {
    const auth = authenticateApiKey(req.headers.authorization);
    if (!auth) {
      res.status(401).json({ message: "Clé API invalide ou absente", code: "INVALID_API_KEY" });
      return;
    }
    const r = req as ApiKeyAuthenticatedRequest;
    r.user = auth.user;
    r.apiKeyId = auth.keyId;
    r.apiKeyScopes = auth.scopes;
    next();
  } catch (err) {
    logger.error("[requireApiKey] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  }
}
