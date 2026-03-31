import { Response } from "express";
import { AuthenticatedRequest } from "./authController";
import { search } from "../services/searchService";

export async function globalSearch(req: AuthenticatedRequest, res: Response) {
  const user = req.user;
  if (!user) { res.status(401).json({ message: "Non authentifié" }); return; }
  const raw = req.query.q;
  const q = typeof raw === "string" ? raw : Array.isArray(raw) ? String(raw[0]) : "";
  const results = search(user.uid, q, user.email);
  res.status(200).json(results);
}
