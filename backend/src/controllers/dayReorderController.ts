/**
 * Day reorder proposal. GET stores nothing. POST books only the plan the client just displayed.
 */
import type { Response } from "express";

import type { AuthenticatedRequest } from "./authController";
import { applyDayReorder, buildDayReorder } from "../services/dayReorderService";

/** GET /calendar/day-reorder */
export async function getDayReorder(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const plan = await buildDayReorder(user.uid, user.email ?? "");
  res.status(200).json(plan);
}

/** POST /calendar/day-reorder/apply — `{ signature }`. */
export async function postDayReorder(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const signature = typeof (req.body as { signature?: unknown } | null)?.signature === "string"
    ? (req.body as { signature: string }).signature
    : "";
  const result = await applyDayReorder(user.uid, user.email ?? "", signature);
  if (result.stale) {
    res.status(409).json({
      code: "DAY_REORDER_STALE",
      message: "L'agenda a changé. Voici la proposition à jour.",
      plan: result.plan,
    });
    return;
  }
  res.status(200).json({ applied: result.applied, failed: result.failed });
}
