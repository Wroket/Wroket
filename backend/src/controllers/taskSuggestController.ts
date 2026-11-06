/**
 * Suggest tasks from a note the caller can edit. The call stores nothing.
 */
import type { Response } from "express";

import type { AuthenticatedRequest } from "./authController";
import type { RequestWithId } from "../middlewares/requestId";
import { resolveNoteAccess } from "../services/noteService";
import { getTaskSuggestConfigFor, suggestTasksForUser } from "../services/taskSuggestService";
import { NotFoundError } from "../utils/errors";

/** GET /notes/task-suggestions/config */
export async function getTaskSuggestConfig(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  res.status(200).json(getTaskSuggestConfigFor(user.uid, user.email));
}

/** POST /notes/:noteId/task-suggestions — `{ consent: "yes", text }`. Stores nothing. */
export async function suggestTasks(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const noteId = req.params.noteId as string;
  const access = resolveNoteAccess(user.uid, user.email ?? "", noteId);
  if (!access?.canWrite) throw new NotFoundError("Note introuvable");
  const body = (req.body ?? {}) as { consent?: unknown; text?: unknown };
  const text = typeof body.text === "string" ? body.text : "";
  const result = await suggestTasksForUser({
    uid: user.uid,
    email: user.email,
    text,
    consent: body.consent,
    requestId: (req as unknown as RequestWithId).id,
  });
  res.status(200).json(result);
}
