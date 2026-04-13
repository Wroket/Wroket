import type { Request, Response, NextFunction } from "express";

/**
 * Prevents shared caches from storing authenticated API responses (stale task lists).
 */
export function noStoreCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "private, no-store");
  next();
}
