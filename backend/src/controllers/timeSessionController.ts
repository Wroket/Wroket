import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  addManualTimeSession,
  getActiveTimerForUser,
  listTimeSessionsForTodo,
  startTimeTimer,
  stopTimeTimer,
  sumMinutesForTodo,
} from "../services/timeSessionService";
import { findTodoForUser } from "../services/todoService";
import { NotFoundError } from "../utils/errors";

async function assertTodoAccess(req: AuthenticatedRequest, todoId: string) {
  const found = await findTodoForUser(req.user!.uid, todoId);
  if (!found) throw new NotFoundError("Tâche introuvable");
  return found;
}

export async function listTodoTimeSessions(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  await assertTodoAccess(req, todoId);
  const sessions = listTimeSessionsForTodo(todoId);
  const totalMinutes = sumMinutesForTodo(todoId);
  const activeTimer = getActiveTimerForUser(req.user!.uid);
  const activeForTodo =
    activeTimer && activeTimer.todoId === todoId && !activeTimer.endedAt ? activeTimer : null;
  res.status(200).json({ sessions, totalMinutes, activeTimer: activeForTodo });
}

export async function startTimer(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  await assertTodoAccess(req, todoId);
  const session = await startTimeTimer(req.user!.uid, req.user!.email ?? "", todoId);
  res.status(201).json(session);
}

export async function stopTimer(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  await assertTodoAccess(req, todoId);
  const session = stopTimeTimer(req.user!.uid, todoId);
  res.status(200).json(session);
}

export async function addManualSession(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.id as string;
  await assertTodoAccess(req, todoId);
  const durationMinutes = Number(req.body?.durationMinutes);
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  const startedAt = typeof req.body?.startedAt === "string" ? req.body.startedAt : undefined;
  const session = await addManualTimeSession(req.user!.uid, todoId, durationMinutes, note, startedAt);
  res.status(201).json(session);
}
