import { NextFunction, Request, Response } from "express";

import { getUserFromRequestCookies } from "../services/authService";
import { AuthenticatedRequest } from "../controllers/authController";
import { logger } from "../utils/logger";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = getUserFromRequestCookies(req.headers.cookie);
    if (!user) {
      res.status(401).json({ message: "Non authentifié" });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    next();
  } catch (err) {
    logger.error("[requireAuth] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: "Erreur serveur" });
  }
}

