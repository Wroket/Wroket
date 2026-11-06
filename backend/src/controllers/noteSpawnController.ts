/**
 * POST/GET tasks proposed from a note. Creation stays behind an explicit confirm in the client.
 */
import type { Response } from "express";

import type { AuthenticatedRequest } from "./authController";
import { listSpawnedTasks, spawnTasksFromNote } from "../services/noteSpawnService";

/** POST /notes/:noteId/spawn-tasks */
export async function spawnTasks(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  const result = await spawnTasksFromNote(user.uid, user.email ?? "", noteId, req.body);
  res.status(200).json(result);
}

/** GET /notes/:noteId/spawned-tasks */
export async function spawnedTasks(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  const todos = await listSpawnedTasks(user.uid, user.email ?? "", noteId);
  res.status(200).json(todos);
}
