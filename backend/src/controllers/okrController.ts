import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  computeOkrProgress,
  createOkr,
  deleteOkr,
  listOkrsForOwner,
  refreshOkrFromTodos,
  updateOkr,
  type OkrKeyResult,
  type OkrStatus,
} from "../services/okrService";

export async function listOkrs(req: AuthenticatedRequest, res: Response) {
  const okrs = listOkrsForOwner(req.user!.uid).map((o) => ({
    ...o,
    progressPercent: computeOkrProgress(o),
  }));
  res.status(200).json({ okrs });
}

export async function createOkrHandler(req: AuthenticatedRequest, res: Response) {
  const okr = createOkr(req.user!.uid, {
    title: String(req.body?.title ?? ""),
    description: typeof req.body?.description === "string" ? req.body.description : "",
    teamId: typeof req.body?.teamId === "string" ? req.body.teamId : null,
    keyResults: Array.isArray(req.body?.keyResults) ? req.body.keyResults : [],
  });
  res.status(201).json({ ...okr, progressPercent: computeOkrProgress(okr) });
}

export async function updateOkrHandler(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const patch: {
    title?: string;
    description?: string;
    status?: OkrStatus;
    teamId?: string | null;
    keyResults?: OkrKeyResult[];
  } = {};
  if (typeof req.body?.title === "string") patch.title = req.body.title;
  if (typeof req.body?.description === "string") patch.description = req.body.description;
  if (typeof req.body?.status === "string") patch.status = req.body.status as OkrStatus;
  if (req.body?.teamId === null || typeof req.body?.teamId === "string") patch.teamId = req.body.teamId;
  if (Array.isArray(req.body?.keyResults)) patch.keyResults = req.body.keyResults;
  const okr = updateOkr(req.user!.uid, id, patch);
  res.status(200).json({ ...okr, progressPercent: computeOkrProgress(okr) });
}

export async function deleteOkrHandler(req: AuthenticatedRequest, res: Response) {
  deleteOkr(req.user!.uid, req.params.id as string);
  res.status(204).send();
}

export async function refreshOkrHandler(req: AuthenticatedRequest, res: Response) {
  const okr = await refreshOkrFromTodos(req.user!.uid, req.user!.email ?? "", req.params.id as string);
  res.status(200).json({ ...okr, progressPercent: computeOkrProgress(okr) });
}
