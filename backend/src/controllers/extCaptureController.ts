import { Response, NextFunction } from "express";

import { ApiKeyAuthenticatedRequest } from "../middlewares/requireApiKey";
import { apiKeyHasScope, type ApiKeyScope } from "../services/authService";
import { getFreeQuotaSnapshot } from "../services/quotaUsageService";
import { listProjects, getProjectById } from "../services/projectService";
import { createTodo, type Priority, type Effort } from "../services/todoService";
import { createNote } from "../services/noteService";
import { normalizeClipSource } from "../types/clipSource";
import { emitUserSyncEvent } from "./syncEventsController";
import { ForbiddenError, ValidationError } from "../utils/errors";

const EXT_MIN_VERSION = "0.1.0";

function requireScope(scopes: ApiKeyScope[] | undefined, needed: ApiKeyScope): void {
  if (!scopes || !apiKeyHasScope(scopes, needed)) {
    throw new ForbiddenError(`Scope manquant: ${needed}`, "MISSING_SCOPE");
  }
}

/**
 * GET /ext/v1/bootstrap — me, quotas, projects/phases, locale hints, minVersion.
 */
export async function extBootstrap(
  req: ApiKeyAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    requireScope(req.apiKeyScopes, "projects:read");
    requireScope(req.apiKeyScopes, "todos:read");

    const quotas = await getFreeQuotaSnapshot(user.uid);
    const projects = listProjects(user.uid, user.email).map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      phases: (p.phases ?? []).map((ph) => ({
        id: ph.id,
        name: ph.name,
        color: ph.color,
      })),
    }));

    res.json({
      me: {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        billingPlan: user.billingPlan,
        earlyBird: user.earlyBird,
        locale: user.workingHours?.timezone?.startsWith("Europe/") ? "fr" : "en",
      },
      quotas,
      projects,
      minVersion: EXT_MIN_VERSION,
      capabilities: {
        captureTask: true,
        captureNote: true,
        scheduleDeepLink: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

type CaptureKind = "task" | "note";

/**
 * POST /ext/v1/capture — create task or note from clip payload.
 */
export async function extCapture(
  req: ApiKeyAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = req.user!;
    const body = req.body as {
      clientId?: string;
      kind?: CaptureKind;
      title?: string;
      projectId?: string | null;
      phaseId?: string | null;
      deadline?: string | null;
      startDate?: string | null;
      priority?: Priority;
      effort?: Effort;
      tags?: string[];
      estimatedMinutes?: number | null;
      source?: unknown;
      content?: string;
    };

    const kind: CaptureKind = body.kind === "note" ? "note" : "task";
    const title = (body.title ?? "").trim();
    if (!title) throw new ValidationError("title requis");

    const source = normalizeClipSource(body.source);
    const clientId =
      typeof body.clientId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.clientId)
        ? body.clientId
        : undefined;

    if (kind === "note") {
      requireScope(req.apiKeyScopes, "notes:write");
      const note = createNote(user.uid, {
        id: clientId,
        title: title.slice(0, 200),
        content: (body.content ?? source?.excerpt ?? source?.url ?? "").slice(0, 50_000),
        projectId: body.projectId?.trim() || undefined,
        tags: body.tags?.slice(0, 10),
        source: source ?? null,
      });
      emitUserSyncEvent(user.uid, { type: "notes", channel: "chrome_ext" });
      res.status(201).json({
        kind: "note",
        id: note.id,
        openUrl: `https://wroket.com/notes?id=${encodeURIComponent(note.id)}`,
      });
      return;
    }

    requireScope(req.apiKeyScopes, "todos:write");
    if (body.projectId) {
      const project = getProjectById(body.projectId);
      if (!project) throw new ValidationError("Projet introuvable");
    }

    const todo = await createTodo(user.uid, user.email, {
      id: clientId,
      title: title.slice(0, 500),
      priority: body.priority === "high" || body.priority === "low" ? body.priority : "medium",
      effort: body.effort === "light" || body.effort === "heavy" ? body.effort : "medium",
      estimatedMinutes: body.estimatedMinutes ?? null,
      projectId: body.projectId ?? null,
      phaseId: body.phaseId ?? null,
      deadline: body.deadline ?? null,
      startDate: body.startDate ?? null,
      tags: body.tags?.slice(0, 10),
      source: source ?? null,
    });

    emitUserSyncEvent(user.uid, { type: "todos", channel: "chrome_ext" });
    res.status(201).json({
      kind: "task",
      id: todo.id,
      openUrl: `https://wroket.com/todos?task=${encodeURIComponent(todo.id)}`,
      scheduleUrl: `https://wroket.com/todos?task=${encodeURIComponent(todo.id)}&schedule=1`,
    });
  } catch (err) {
    next(err);
  }
}
