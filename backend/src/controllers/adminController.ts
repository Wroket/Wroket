import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { isAdmin, getAdminStats, getAdminUsers } from "../services/adminService";

function requireAdmin(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.user || !isAdmin(req.user.email)) {
    res.status(403).json({ message: "Accès refusé" });
    return false;
  }
  return true;
}

export async function adminStats(req: AuthenticatedRequest, res: Response) {
  if (!requireAdmin(req, res)) return;
  res.status(200).json(getAdminStats());
}

export async function adminUsers(req: AuthenticatedRequest, res: Response) {
  if (!requireAdmin(req, res)) return;
  res.status(200).json(getAdminUsers());
}
