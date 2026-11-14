import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  applyCommitteeShare,
  applyPlanWeekBooks,
  previewCommittee,
  previewPlanWeek,
  previewRisks,
  type PlanWeekBookItem,
} from "../services/assistCommandsService";
import { ConflictError, ValidationError } from "../utils/errors";

export async function getCommitteePreview(req: AuthenticatedRequest, res: Response) {
  const projectId = String(req.query.projectId ?? req.params.projectId ?? "").trim();
  if (!projectId) throw new ValidationError("projectId requis", "ASSIST_PROJECT_ID_REQUIRED");
  const preview = await previewCommittee(req.user!.uid, req.user!.email ?? "", projectId);
  res.status(200).json(preview);
}

export async function postCommitteeApply(req: AuthenticatedRequest, res: Response) {
  const projectId = String(req.body?.projectId ?? "").trim();
  if (!projectId) throw new ValidationError("projectId requis", "ASSIST_PROJECT_ID_REQUIRED");
  const result = applyCommitteeShare(req.user!.uid, req.user!.email ?? "", projectId);
  res.status(201).json(result);
}

export async function getPlanWeekPreview(req: AuthenticatedRequest, res: Response) {
  const preview = await previewPlanWeek(req.user!.uid, req.user!.email ?? "");
  res.status(200).json(preview);
}

export async function postPlanWeekApply(req: AuthenticatedRequest, res: Response) {
  const bookings = Array.isArray(req.body?.bookings) ? (req.body.bookings as PlanWeekBookItem[]) : [];
  const force = !!req.body?.force;
  const result = await applyPlanWeekBooks(req.user!.uid, req.user!.email ?? "", bookings, force);
  if (result.conflicts.length > 0 && result.booked.length === 0 && result.errors.length === 0) {
    throw new ConflictError(
      "Conflits de créneau — réessayez avec force=true ou choisissez d’autres créneaux",
      "CALENDAR_SLOT_CONFLICT",
      result.conflicts.flatMap((c) => c.conflicts ?? []),
    );
  }
  res.status(200).json(result);
}

export async function getRisksPreview(req: AuthenticatedRequest, res: Response) {
  const preview = await previewRisks(req.user!.uid, req.user!.email ?? "");
  res.status(200).json(preview);
}
