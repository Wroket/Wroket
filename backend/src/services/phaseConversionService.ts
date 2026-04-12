import { removeCommentsForTodos } from "./commentService";
import { NotFoundError, ForbiddenError, ValidationError } from "../utils/errors";
import {
  addPhase,
  createProject,
  deletePhase,
  deleteProject,
  getProjectById,
  canEditProjectContent,
  listChildProjects,
  type Project,
  type ProjectPhase,
} from "./projectService";
import {
  applyTodoPatchesForPhaseConversion,
  hardRemoveTodosByIds,
  listProjectTodos,
  type Todo,
  type TodoPhaseConversionPatch,
} from "./todoService";

export type PhaseConversionTaskMode = "flat" | "tasks_as_phases";
export type PhaseConversionSubtaskMode = "in_phase" | "unphased";

export interface ConvertPhaseToSubprojectInput {
  name?: string;
  taskMode: PhaseConversionTaskMode;
  subtaskMode: PhaseConversionSubtaskMode;
}

export interface ConvertPhaseToSubprojectResult {
  subProject: Project;
  parentProject: Project;
}

export interface ConvertSubprojectToPhaseInput {
  /** Optional name for the single phase when the sub-project had no phases (defaults to sub-project name). */
  phaseName?: string;
}

export interface ConvertSubprojectToPhaseResult {
  parentProject: Project;
}

function getPhaseGroupRoot(t: Todo, inPhase: Set<string>, byId: Map<string, Todo>): Todo {
  let cur: Todo | undefined = t;
  const seen = new Set<string>();
  while (cur) {
    if (!cur.parentId || !inPhase.has(cur.parentId)) return cur;
    if (seen.has(cur.id)) return cur;
    seen.add(cur.id);
    cur = byId.get(cur.parentId);
  }
  return t;
}

function sortRootsForConversion(roots: Todo[]): Todo[] {
  return [...roots].sort((a, b) => {
    const ao = a.sortOrder ?? 999_999;
    const bo = b.sortOrder ?? 999_999;
    if (ao !== bo) return ao - bo;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Converts a phase into a child project and moves tasks. Caller must enforce auth.
 */
export function convertPhaseToSubproject(
  uid: string,
  userEmail: string,
  projectId: string,
  phaseId: string,
  input: ConvertPhaseToSubprojectInput,
): ConvertPhaseToSubprojectResult {
  const project = getProjectById(projectId);
  if (!project) throw new NotFoundError("Projet introuvable");
  if (!canEditProjectContent(uid, userEmail.trim().toLowerCase(), project)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }
  if (project.parentProjectId) {
    throw new ForbiddenError("Impossible de créer un sous-projet depuis une phase : le projet courant est déjà un sous-projet");
  }

  const phase = project.phases.find((p) => p.id === phaseId);
  if (!phase) throw new NotFoundError("Phase introuvable");

  const allProjectTodos = listProjectTodos(projectId);
  const phaseTodosAll = allProjectTodos.filter((t) => t.phaseId === phaseId);
  const byId = new Map<string, Todo>();
  for (const t of allProjectTodos) byId.set(t.id, t);
  const inPhase = new Set(phaseTodosAll.map((t) => t.id));

  const subName = (input.name?.trim() || phase.name).trim();
  if (!subName) throw new ValidationError("Le nom du sous-projet est requis");

  const subProject = createProject(uid, userEmail, {
    name: subName,
    teamId: project.teamId ?? undefined,
    parentProjectId: projectId,
  });

  const subId = subProject.id;

  if (input.taskMode === "flat") {
    const patches: TodoPhaseConversionPatch[] = phaseTodosAll.map((t) => ({
      todoId: t.id,
      projectId: subId,
      phaseId: null,
      parentId: t.parentId,
    }));
    applyTodoPatchesForPhaseConversion(patches);
  } else {
    const roots = phaseTodosAll.filter((t) => !t.parentId || !inPhase.has(t.parentId));
    if (roots.length > 50) {
      throw new ValidationError("Trop de tâches racines pour le mode « tâches → phases » (max 50)");
    }
    const sortedRoots = sortRootsForConversion(roots);
    const rootIds = new Set(sortedRoots.map((r) => r.id));
    const rootToNewPhase = new Map<string, string>();

    for (const root of sortedRoots) {
      const title = root.title?.trim() || "Phase";
      const newPhase: ProjectPhase = addPhase(subId, { name: title });
      rootToNewPhase.set(root.id, newPhase.id);
    }

    const patches: TodoPhaseConversionPatch[] = [];
    const subMode = input.subtaskMode;

    for (const t of phaseTodosAll) {
      if (rootIds.has(t.id)) continue;

      const groupRoot = getPhaseGroupRoot(t, inPhase, byId);
      const newPhId = rootToNewPhase.get(groupRoot.id);
      if (!newPhId) continue;

      let nextParent = t.parentId;
      if (nextParent && rootIds.has(nextParent)) nextParent = null;

      if (subMode === "in_phase") {
        patches.push({
          todoId: t.id,
          projectId: subId,
          phaseId: newPhId,
          parentId: nextParent,
        });
      } else {
        patches.push({
          todoId: t.id,
          projectId: subId,
          phaseId: null,
          parentId: nextParent,
        });
      }
    }

    applyTodoPatchesForPhaseConversion(patches);

    removeCommentsForTodos([...rootIds]);
    hardRemoveTodosByIds([...rootIds]);
  }

  deletePhase(projectId, phaseId);

  const parentAfter = getProjectById(projectId);
  const subAfter = getProjectById(subId);
  if (!parentAfter || !subAfter) {
    throw new NotFoundError("Projet introuvable après conversion");
  }

  return { subProject: subAfter, parentProject: parentAfter };
}

/**
 * Merges a direct sub-project into its parent as one or more phases and moves all tasks.
 * Inverse of {@link convertPhaseToSubproject} (sub-project → phases on parent).
 */
export function convertSubprojectToPhase(
  uid: string,
  userEmail: string,
  parentProjectId: string,
  subProjectId: string,
  input: ConvertSubprojectToPhaseInput = {},
): ConvertSubprojectToPhaseResult {
  const parent = getProjectById(parentProjectId);
  const sub = getProjectById(subProjectId);
  if (!parent || !sub) throw new NotFoundError("Projet introuvable");
  if (parent.parentProjectId) {
    throw new ForbiddenError("Le projet parent doit être un projet racine");
  }
  if (sub.parentProjectId !== parentProjectId) {
    throw new ValidationError("Ce n'est pas un sous-projet direct de ce projet");
  }
  const email = userEmail.trim().toLowerCase();
  if (!canEditProjectContent(uid, email, parent)) {
    throw new ForbiddenError("Accès réservé (super-user minimum)");
  }
  if (!canEditProjectContent(uid, email, sub)) {
    throw new ForbiddenError("Accès réservé au sous-projet");
  }
  if (listChildProjects(subProjectId).length > 0) {
    throw new ValidationError("Déplacez les sous-projets imbriqués avant de fusionner");
  }

  const sortedSubPhases = [...sub.phases].sort((a, b) => a.order - b.order);
  const phaseMap = new Map<string, string>();
  let fallbackPhaseId: string;

  if (sortedSubPhases.length === 0) {
    const name = (input.phaseName?.trim() || sub.name).trim().substring(0, 200);
    if (!name) throw new ValidationError("Le nom de la phase est requis");
    const ph = addPhase(parentProjectId, { name });
    fallbackPhaseId = ph.id;
  } else {
    for (const sph of sortedSubPhases) {
      const ph = addPhase(parentProjectId, {
        name: sph.name,
        color: sph.color,
        startDate: sph.startDate,
        endDate: sph.endDate,
      });
      phaseMap.set(sph.id, ph.id);
    }
    fallbackPhaseId = phaseMap.get(sortedSubPhases[0]!.id)!;
  }

  const todos = listProjectTodos(subProjectId);
  const patches: TodoPhaseConversionPatch[] = todos.map((t) => {
    const nextPhase = t.phaseId ? phaseMap.get(t.phaseId) ?? fallbackPhaseId : fallbackPhaseId;
    return {
      todoId: t.id,
      projectId: parentProjectId,
      phaseId: nextPhase,
      parentId: t.parentId,
    };
  });
  applyTodoPatchesForPhaseConversion(patches);

  deleteProject(uid, userEmail, subProjectId);

  const parentAfter = getProjectById(parentProjectId);
  if (!parentAfter) throw new NotFoundError("Projet introuvable");
  return { parentProject: parentAfter };
}
