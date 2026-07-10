import { NextFunction, Request, Response } from "express";

import type { AuthenticatedRequest } from "../controllers/authController";
import { canAccessProductFeatures } from "../services/teamService";
import { ForbiddenError } from "../utils/errors";

/**
 * Blocks workspace-admin-only users from core product API routes.
 * See docs/workspace-admin.md for the allowlist matrix.
 */
export function requireProductAccess(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    next();
    return;
  }
  if (!canAccessProductFeatures(user.uid, user.email)) {
    next(
      new ForbiddenError(
        "Accès produit réservé aux membres avec siège",
        "WORKSPACE_ADMIN_PRODUCT_DENIED",
      ),
    );
    return;
  }
  next();
}
