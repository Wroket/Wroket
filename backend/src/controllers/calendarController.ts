import { Request, Response } from "express";

import { AuthenticatedRequest } from "./authController";
import { findAvailableSlots } from "../services/calendarService";
import { updateTodo, listTodos } from "../services/todoService";
import {
  findUserByUid,
  DEFAULT_WORKING_HOURS,
  getGoogleCalendarTokens,
  setGoogleCalendarTokens,
  removeGoogleCalendarTokens,
} from "../services/authService";
import { NotFoundError, ValidationError } from "../utils/errors";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  listGoogleCalendarEvents,
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "../services/googleCalendarService";
import { createOAuthState, consumeOAuthState } from "../utils/oauthState";

export async function getSlots(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId;
  const uid = req.user!.uid;

  const todos = listTodos(uid);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) throw new NotFoundError("Tâche introuvable");

  const user = findUserByUid(uid);
  const workingHours = user?.workingHours ?? DEFAULT_WORKING_HOURS;

  const effortDefaults = user?.effortMinutes ?? { light: 10, medium: 30, heavy: 60 };
  const effort = todo.effort ?? "medium";
  const hasCustomEstimate = todo.estimatedMinutes != null;
  const duration = hasCustomEstimate ? todo.estimatedMinutes! : effortDefaults[effort];
  const durationSource = hasCustomEstimate ? "task" as const : "settings" as const;

  const slots = findAvailableSlots(uid, duration, workingHours, []);
  res.status(200).json({ slots, duration, durationSource, effort });
}

export async function bookSlot(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;
  const { start, end } = req.body as { start: string; end: string };

  if (!start || !end) throw new ValidationError("start and end required");

  const todos = listTodos(uid);
  const todo = todos.find((t) => t.id === todoId);
  if (!todo) throw new NotFoundError("Tâche introuvable");

  let calendarEventId: string | null = null;
  const tokens = getGoogleCalendarTokens(uid);
  if (tokens) {
    const user = findUserByUid(uid);
    const tz = user?.workingHours?.timezone ?? DEFAULT_WORKING_HOURS.timezone;
    calendarEventId = await createGoogleCalendarEvent(uid, todo.title, start, end, tz);
  }

  const updated = updateTodo(uid, todoId, {
    scheduledSlot: { start, end, calendarEventId },
  });

  res.status(200).json(updated);
}

export async function clearSlot(req: AuthenticatedRequest, res: Response) {
  const todoId = req.params.todoId as string;
  const uid = req.user!.uid;

  const todos = listTodos(uid);
  const todo = todos.find((t) => t.id === todoId);
  if (todo?.scheduledSlot?.calendarEventId) {
    await deleteGoogleCalendarEvent(uid, todo.scheduledSlot.calendarEventId);
  }

  const updated = updateTodo(uid, todoId, {
    scheduledSlot: null,
  });
  res.status(200).json(updated);
}

export async function googleAuthUrl(req: AuthenticatedRequest, res: Response) {
  // FIX: Use a cryptographically random state token instead of the raw UID.
  // The token is stored server-side and validated on callback.
  const state = createOAuthState(req.user!.uid);
  const url = getGoogleAuthUrl(state);
  res.status(200).json({ url });
}

export async function googleCallback(req: Request, res: Response) {
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code || !state) {
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
    return;
  }

  // FIX: Validate and consume the state token. This prevents:
  //   1. An attacker from injecting their own code with a victim's UID
  //   2. Replay attacks (token is single-use)
  //   3. Stale flows (token expires after 10 min)
  const uid = consumeOAuthState(state);
  if (!uid) {
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    setGoogleCalendarTokens(uid, tokens);
    res.redirect(`${frontendUrl}/agenda?google=connected`);
  } catch (err) {
    console.error("[google-oauth] Error:", err);
    res.redirect(`${frontendUrl}/settings?error=google_auth_failed`);
  }
}

export async function disconnectGoogle(req: AuthenticatedRequest, res: Response) {
  removeGoogleCalendarTokens(req.user!.uid);
  res.status(200).json({ message: "Google Calendar disconnected" });
}

export async function getCalendarEvents(req: AuthenticatedRequest, res: Response) {
  const uid = req.user!.uid;
  const start = req.query.start as string;
  const end = req.query.end as string;

  if (!start || !end) throw new ValidationError("start and end query params required");

  const todos = listTodos(uid);
  const wroketEvents = todos
    .filter((t) => t.scheduledSlot && t.status === "active")
    .map((t) => ({
      id: t.id,
      summary: t.title,
      start: t.scheduledSlot!.start,
      end: t.scheduledSlot!.end,
      allDay: false,
      source: "wroket" as const,
      priority: t.priority,
      effort: t.effort,
      deadline: t.deadline,
    }));

  const googleEvents = await listGoogleCalendarEvents(uid, start, end);

  // Filter out Google events that were created by Wroket (avoid duplicates)
  const wroketGoogleIds = new Set(
    todos
      .filter((t) => t.scheduledSlot?.calendarEventId)
      .map((t) => t.scheduledSlot!.calendarEventId!),
  );
  const filteredGoogleEvents = googleEvents.filter((e) => !wroketGoogleIds.has(e.id));

  res.status(200).json({ wroketEvents, googleEvents: filteredGoogleEvents });
}
