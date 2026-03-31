import { NextFunction, Response } from "express";

import { AuthenticatedRequest } from "../controllers/authController";
import { isAdmin } from "../services/adminService";

/**
 * Route-level middleware that rejects non-admin users with 403.
 *
 * WHY: The existing code checks `isAdmin()` inside each admin controller
 * function. If a developer adds a new admin endpoint and forgets the check,
 * it is silently exposed to any authenticated user. Applying this middleware
 * at the router level provides defense-in-depth — even a missing controller
 * check cannot bypass it.
 *
 * Usage in adminRoutes.ts:
 *   adminRoutes.use(requireAuth);
 *   adminRoutes.use(requireAdmin);   // ← add this line
 *   adminRoutes.get("/stats", adminStats);
 */
export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user || !isAdmin(req.user.email)) {
    res.status(403).json({ message: "Accès refusé" });
    return;
  }
  next();
}
