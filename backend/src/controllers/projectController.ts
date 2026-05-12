import { Response } from "express";

import { AuthenticatedRequest } from "./authController";
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  addPhase,
  updatePhase,
  deletePhase,
  listChildProjects,
  canAccessProject,
  canEditProject,
  canEditProjectContent,
  canManageProjectAccess,
  setProjectAccessForUser,
  getTeamRosterEmails,
  CreateProjectInput,
  UpdateProjectInput,
  CreatePhaseInput,
  UpdatePhaseInput,
  type ProjectAccessEntry,
} from "../services/projectService";
import {
  cascadeArchiveActiveSubprojects,
  cascadeRestoreArchivedSubprojects,
} from "../services/projectArchiveCascadeService";
import {
  listProjectTodos,
  clearProjectPhaseReferences,
  createTodo,
  archiveTodosByProjectId,
  permanentlyPurgeTodosByProjectId,
} from "../services/todoService";
import { listComments } from "../services/commentService";
import {
  convertPhaseToSubproject as convertPhaseToSubprojectService,
  convertSubprojectToPhase as convertSubprojectToPhaseService,
} from "../services/phaseConversionService";
import { getTeam } from "../services/teamService";
import { NotFoundError, ForbiddenError, ValidationError } from "../utils/errors";
import { logActivity } from "../services/activityLogService";

export async function list(req: AuthenticatedRequest, res: Response) {
  const projects = listProjects(req.user!.uid, req.user!.email ?? "");
  res.status(200).json(projects);
}

export async function get(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");

  if (!canAccessProject(req.user!.uid, req.user!.email ?? "", project)) {
    throw new ForbiddenError("Accès refusé");
  }

  res.status(200).json(project);
}

export async function getAccess(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canAccessProject(req.user!.uid, req.user!.email ?? "", project)) {
    throw new ForbiddenError("Accès refusé");
  }
  if (!project.teamId) {
    res.status(200).json({
      teamId: null,
      roster: [] as string[],
      access: [] as ProjectAccessEntry[],
      canManage: false,
    });
    return;
  }
  const team = getTeam(project.teamId);
  const roster = team ? getTeamRosterEmails(team) : [];
  res.status(200).json({
    teamId: project.teamId,
    roster,
    access: project.projectAccess ?? [],
    canManage: canManageProjectAccess(req.user!.uid, req.user!.email ?? "", project),
  });
}

export async function putAccess(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const body = req.body as { access?: unknown };
  if (!Array.isArray(body.access)) {
    throw new ValidationError("access doit être un tableau { email, role }");
  }
  const access = body.access as ProjectAccessEntry[];
  const project = setProjectAccessForUser(req.user!.uid, req.user!.email ?? "", id, access);
  logActivity(req.user!.uid, req.user!.email ?? "", "update", "project", project.id, { projectAccess: true });
  res.status(200).json(project);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const { name, description, teamId, parentProjectId } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    throw new ValidationError("Le nom du projet est requis");
  }
  const input: CreateProjectInput = {
    name,
    description: typeof description === "string" ? description : undefined,
    teamId: typeof teamId === "string" ? teamId : undefined,
    parentProjectId: typeof parentProjectId === "string" ? parentProjectId : undefined,
  };
  const project = createProject(req.user!.uid, req.user!.email, input);
  logActivity(req.user!.uid, req.user!.email, "create", "project", project.id, { name: project.name });
  res.status(201).json(project);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const body = req.body ?? {};
  const previous = getProjectById(id);
  const input: UpdateProjectInput = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string") throw new ValidationError("name doit être une chaîne");
    input.name = body.name;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") throw new ValidationError("description doit être une chaîne");
    input.description = body.description;
  }
  if (body.teamId !== undefined) input.teamId = typeof body.teamId === "string" ? body.teamId : null;
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "archived") {
      throw new ValidationError("status invalide (active | archived)");
    }
    input.status = body.status;
  }
  if (body.parentProjectId !== undefined) {
    input.parentProjectId = typeof body.parentProjectId === "string" ? body.parentProjectId : null;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t: unknown) => typeof t === "string")) {
      throw new ValidationError("tags doit être un tableau de chaînes");
    }
    input.tags = body.tags;
  }
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  const project = updateProject(uid, email, id, input);
  if (input.status === "archived" && previous?.status !== "archived") {
    await archiveTodosByProjectId(project.id);
    await cascadeArchiveActiveSubprojects(uid, email, project.id);
  } else if (input.status === "active" && previous?.status === "archived") {
    cascadeRestoreArchivedSubprojects(uid, email, project.id);
  }
  logActivity(uid, email, "update", "project", project.id, { name: project.name });
  res.status(200).json(project);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  const project = getProjectById(id);
  // Direct child subprojects only (deeper nesting is unchanged by this delete — same as archive cascade).
  const directChildren = listChildProjects(id);
  for (const child of directChildren) {
    await permanentlyPurgeTodosByProjectId(child.id);
    deleteProject(uid, email, child.id);
    logActivity(uid, email, "delete", "project", child.id, {
      name: child.name,
      cascadeFrom: id,
    });
  }
  deleteProject(uid, email, id);
  await permanentlyPurgeTodosByProjectId(id);
  logActivity(uid, email, "delete", "project", id, project?.name ? { name: project.name } : undefined);
  res.status(204).end();
}

export async function getTodos(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");

  if (!canAccessProject(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès refusé");
  }

  const allProjectTodos = listProjectTodos(project.id);
  const directTodos = allProjectTodos.filter((t) => !t.parentId);
  const directIds = new Set(directTodos.map((t) => t.id));
  const subtasks = allProjectTodos.filter((t) => t.parentId && directIds.has(t.parentId));
  res.status(200).json([...directTodos, ...subtasks]);
}

export async function getAllTodos(req: AuthenticatedRequest, res: Response) {
  const projects = listProjects(req.user!.uid, req.user!.email);
  const result: Record<string, unknown[]> = {};
  for (const project of projects) {
    const todos = listProjectTodos(project.id).filter((t) => !t.parentId);
    if (todos.length > 0) result[project.id] = todos;
  }
  res.status(200).json(result);
}

export async function reorder(req: AuthenticatedRequest, res: Response) {
  const { projectIds } = req.body as { projectIds?: string[] };
  if (!Array.isArray(projectIds)) {
    res.status(400).json({ error: "projectIds requis" });
    return;
  }
  const updated = reorderProjects(req.user!.uid, req.user!.email, projectIds);
  res.status(200).json({ message: "OK", updated });
}

// ── Phases ──

export async function createPhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }

  if (typeof req.body.name !== "string" || !req.body.name.trim()) {
    throw new ValidationError("name doit être une chaîne non vide");
  }
  if (req.body.color !== undefined && typeof req.body.color !== "string") {
    throw new ValidationError("color doit être une chaîne");
  }
  if (req.body.startDate !== undefined && req.body.startDate !== null && typeof req.body.startDate !== "string") {
    throw new ValidationError("startDate doit être une chaîne ou null");
  }
  if (req.body.endDate !== undefined && req.body.endDate !== null && typeof req.body.endDate !== "string") {
    throw new ValidationError("endDate doit être une chaîne ou null");
  }
  const input: CreatePhaseInput = {
    name: req.body.name,
    color: req.body.color,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
  };
  const phase = addPhase(projectId, input);
  res.status(201).json(phase);
}

export async function patchPhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }

  const phaseId = req.params.phaseId as string;
  if (req.body.name !== undefined && typeof req.body.name !== "string") {
    throw new ValidationError("name doit être une chaîne");
  }
  if (req.body.color !== undefined && typeof req.body.color !== "string") {
    throw new ValidationError("color doit être une chaîne");
  }
  if (req.body.startDate !== undefined && req.body.startDate !== null && typeof req.body.startDate !== "string") {
    throw new ValidationError("startDate doit être une chaîne ou null");
  }
  if (req.body.endDate !== undefined && req.body.endDate !== null && typeof req.body.endDate !== "string") {
    throw new ValidationError("endDate doit être une chaîne ou null");
  }
  if (req.body.order !== undefined && typeof req.body.order !== "number") {
    throw new ValidationError("order doit être un nombre");
  }
  const input: UpdatePhaseInput = {};
  if (req.body.name !== undefined) input.name = req.body.name;
  if (req.body.color !== undefined) input.color = req.body.color;
  if (req.body.order !== undefined) input.order = req.body.order;
  if (req.body.startDate !== undefined) input.startDate = req.body.startDate;
  if (req.body.endDate !== undefined) input.endDate = req.body.endDate;
  const phase = updatePhase(projectId, phaseId, input);
  res.status(200).json(phase);
}

export async function removePhase(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(req.user!.uid, req.user!.email, project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }

  const phaseId = req.params.phaseId as string;
  deletePhase(projectId, phaseId);
  await clearProjectPhaseReferences(projectId, phaseId);
  res.status(204).end();
}

// ── Export / Import ──

const CSV_FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);
function csvSafe(value: string): string {
  let v = value.replace(/"/g, '""');
  if (v.length > 0 && CSV_FORMULA_TRIGGERS.has(v[0])) v = `'${v}`;
  return `"${v}"`;
}

export async function exportProject(req: AuthenticatedRequest, res: Response) {
  const id = req.params.id as string;
  const format = (req.query.format as string)?.toLowerCase() === "json" ? "json" : "csv";
  const project = getProjectById(id);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canAccessProject(req.user!.uid, req.user!.email ?? "", project)) {
    throw new ForbiddenError("Accès refusé");
  }

  const allTodos = listProjectTodos(project.id);
  const slug = project.name.replace(/[^a-z0-9]+/gi, "-").substring(0, 40);

  if (format === "json") {
    const comments: Record<string, unknown[]> = {};
    for (const t of allTodos) {
      const tc = listComments(t.id);
      if (tc.length > 0) comments[t.id] = tc.map((c) => ({ author: c.userEmail, text: c.text, createdAt: c.createdAt }));
    }
    const data = {
      project: { id: project.id, name: project.name, description: project.description, status: project.status, tags: project.tags },
      phases: project.phases ?? [],
      tasks: allTodos.map((t) => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority, effort: t.effort, estimatedMinutes: t.estimatedMinutes,
        startDate: t.startDate, deadline: t.deadline, tags: t.tags, phaseId: t.phaseId, parentId: t.parentId,
        assignedTo: t.assignedTo, createdAt: t.createdAt, updatedAt: t.updatedAt,
      })),
      comments,
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=wroket-project-${slug}.json`);
    res.send(JSON.stringify(data, null, 2));
    return;
  }

  const header = "id,title,status,priority,effort,estimatedMinutes,startDate,deadline,tags,phaseName,parentId,assignedTo,createdAt\n";
  const phaseMap = new Map((project.phases ?? []).map((p) => [p.id, p.name]));
  const rows = allTodos
    .map((t) => [
      t.id, csvSafe(t.title ?? ""), t.status, t.priority ?? "", t.effort ?? "",
      t.estimatedMinutes != null ? String(t.estimatedMinutes) : "",
      t.startDate ?? "", t.deadline ?? "", csvSafe((t.tags ?? []).join(", ")),
      csvSafe(phaseMap.get(t.phaseId ?? "") ?? ""), t.parentId ?? "", t.assignedTo ?? "", t.createdAt ?? "",
    ].join(","))
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=wroket-project-${slug}.csv`);
  res.send(header + rows);
}

export async function importProjectTasks(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const uid = req.user!.uid;
  const email = req.user!.email ?? "";
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(uid, email, project)) {
    throw new ForbiddenError("Accès réservé");
  }

  let tasks: Array<Record<string, unknown>>;

  if (req.file) {
    const text = req.file.buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (req.file.originalname.endsWith(".json") || req.file.mimetype === "application/json") {
      const parsed = JSON.parse(text);
      tasks = Array.isArray(parsed.tasks) ? parsed.tasks : Array.isArray(parsed) ? parsed : [];
    } else {
      tasks = parseCsvToRows(text);
    }
  } else if (req.body?.tasks && Array.isArray(req.body.tasks)) {
    tasks = req.body.tasks;
  } else {
    throw new ValidationError("Fichier ou tableau de tâches requis");
  }

  if (tasks.length === 0) throw new ValidationError("Aucune tâche à importer");
  if (tasks.length > 1000) throw new ValidationError("Maximum 1000 tâches par import");

  const phaseMap = new Map((project.phases ?? []).map((p) => [p.name.toLowerCase().trim(), p.id]));

  const seenNewKeys = new Set<string>();
  const phasesToCreate: string[] = [];
  for (const task of tasks) {
    const t = task as Record<string, string>;
    const raw = (t.phaseName || t.phase_name || t.phase || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (phaseMap.has(key)) continue;
    if (seenNewKeys.has(key)) continue;
    seenNewKeys.add(key);
    phasesToCreate.push(raw);
  }
  for (const displayName of phasesToCreate) {
    const phase = addPhase(projectId, { name: displayName });
    phaseMap.set(displayName.toLowerCase().trim(), phase.id);
  }

  let created = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i] as Record<string, string>;
    const title = (t.title || t.task_title || "").trim();
    if (!title) { errors.push({ row: i + 1, message: "Titre requis" }); continue; }

    const rawPhase = (t.phaseName || t.phase_name || t.phase || "").trim();
    const phaseKey = rawPhase.toLowerCase();
    const resolvedPhaseId = rawPhase ? phaseMap.get(phaseKey) ?? null : null;

    try {
      await createTodo(uid, email, {
        title,
        priority: (["low", "medium", "high"].includes(t.priority ?? "") ? t.priority : "medium") as "low" | "medium" | "high",
        effort: (["light", "medium", "heavy"].includes(t.effort ?? "") ? t.effort : "medium") as "light" | "medium" | "heavy",
        estimatedMinutes: t.estimatedMinutes ? Number(t.estimatedMinutes) || null : null,
        startDate: t.startDate ?? null,
        deadline: t.deadline ?? null,
        tags: typeof t.tags === "string" ? t.tags.split(",").map((s: string) => s.trim()).filter(Boolean) : Array.isArray(t.tags) ? t.tags as unknown as string[] : [],
        projectId,
        phaseId: resolvedPhaseId,
        assignedTo: t.assignedTo ?? null,
      });
      created++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : "Erreur" });
    }
  }

  res.status(201).json({ created, errors, total: tasks.length });
}

function parseCsvToRows(text: string): Array<Record<string, string>> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new ValidationError("Le CSV doit contenir un en-tête et au moins une ligne");
  const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const fields = line.split(/[,;]/).map((f) => f.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h === "task_title" ? "title" : h] = fields[i] ?? ""; });
    return row;
  });
}

export async function convertPhaseToSubproject(req: AuthenticatedRequest, res: Response) {
  const projectId = req.params.id as string;
  const phaseId = req.params.phaseId as string;
  const body = req.body as { name?: string; taskMode?: string; subtaskMode?: string };

  const rawName = typeof body.name === "string" ? body.name.substring(0, 200) : undefined;
  const taskMode = body.taskMode === "tasks_as_phases" ? "tasks_as_phases" : "flat";
  const subtaskMode = body.subtaskMode === "unphased" ? "unphased" : "in_phase";

  const result = await convertPhaseToSubprojectService(req.user!.uid, req.user!.email ?? "", projectId, phaseId, {
    name: rawName,
    taskMode,
    subtaskMode,
  });

  logActivity(req.user!.uid, req.user!.email ?? "", "update", "project", projectId, {
    phaseConvertedToSubproject: true,
    phaseId,
    subProjectId: result.subProject.id,
  });

  res.status(200).json(result);
}

export async function convertSubprojectToPhase(req: AuthenticatedRequest, res: Response) {
  const parentId = req.params.id as string;
  const subId = req.params.subId as string;
  const body = req.body as { phaseName?: string };
  const phaseName = typeof body.phaseName === "string" ? body.phaseName.substring(0, 200) : undefined;

  const result = await convertSubprojectToPhaseService(req.user!.uid, req.user!.email ?? "", parentId, subId, {
    phaseName,
  });

  logActivity(req.user!.uid, req.user!.email ?? "", "update", "project", parentId, {
    subprojectMergedAsPhases: true,
    subProjectId: subId,
  });

  res.status(200).json(result);
}
