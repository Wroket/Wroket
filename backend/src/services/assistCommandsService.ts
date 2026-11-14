/**
 * IA Phase 2 — deterministic PMO assist commands (no hosted LLM).
 * Previews reuse digests / steering / slot proposals; mutations require explicit apply.
 */

import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { bookTodoSlot, proposeSlotsForTodo } from "./calendarSlotService";
import {
  digestTodosToRows,
  getMyWeekFocus,
  getOverdueTodos,
  getTeamRiskRows,
  type DigestTodoRow,
  type TeamRiskRow,
} from "./pmoDigestService";
import { canAccessProject, canEditProject, getProjectById } from "./projectService";
import {
  createProjectShareLink,
  listShareLinksForProject,
  type ProjectShareLink,
} from "./projectShareLinkService";
import {
  computeProjectSteeringSnapshot,
  isEffectivelyOverdue,
  type ProjectSteeringSnapshot,
} from "./projectSteeringService";
import { listProjectTodos, listTodos, listAssignedToMe, type Todo } from "./todoService";

const PLAN_WEEK_SLOT_CAP = 5;
const FRONTEND_BASE = (process.env.FRONTEND_URL || "https://wroket.com").replace(/\/$/, "");

function sharePublicUrl(token: string): string {
  return `${FRONTEND_BASE}/share/project/${encodeURIComponent(token)}`;
}

function leanBlocked(todo: Todo, byId: Map<string, Todo>): { id: string; title: string }[] {
  return (todo.blockedByTodoIds ?? [])
    .map((id) => byId.get(id))
    .filter((t): t is Todo => !!t && t.status === "active")
    .map((t) => ({ id: t.id, title: t.title }));
}

export type CommitteePreview = {
  command: "committee";
  projectId: string;
  projectName: string;
  steering: ProjectSteeringSnapshot;
  overdueTasks: DigestTodoRow[];
  blockedTasks: { id: string; title: string; blockers: { id: string; title: string }[] }[];
  activeShareLinks: { id: string; token: string; publicUrl: string; expiresAt: string | null }[];
  canCreateShareLink: boolean;
  summaryMarkdown: string;
};

export type PlanWeekSuggestion = {
  todoId: string;
  title: string;
  proposedStart: string;
  proposedEnd: string;
  label: string;
};

export type PlanWeekPreview = {
  command: "plan-week";
  focus: DigestTodoRow[];
  suggestions: PlanWeekSuggestion[];
  unscheduledWithoutSlot: { todoId: string; title: string; reason: string }[];
  summaryMarkdown: string;
};

export type RisksPreview = {
  command: "risks";
  hasTeams: boolean;
  projects: TeamRiskRow[];
  overdueTasks: DigestTodoRow[];
  summaryMarkdown: string;
};

/**
 * Preview « Prépare mon comité » for a project.
 */
export async function previewCommittee(
  uid: string,
  email: string,
  projectId: string,
): Promise<CommitteePreview> {
  const project = getProjectById(projectId);
  if (!project || project.status !== "active") {
    throw new NotFoundError("Projet introuvable", "ASSIST_PROJECT_NOT_FOUND");
  }
  if (!canAccessProject(uid, email, project)) {
    throw new ForbiddenError("Accès projet refusé", "ASSIST_PROJECT_FORBIDDEN");
  }

  const todos = await listProjectTodos(project.id);
  const byId = new Map(todos.map((t) => [t.id, t]));
  const now = new Date();
  const steering = computeProjectSteeringSnapshot(project, todos, now);
  const overdueTasks = digestTodosToRows(
    todos.filter((t) => t.status === "active" && isEffectivelyOverdue(t, now) && !t.parentId),
    now,
  );
  const blockedTasks = todos
    .filter((t) => t.status === "active" && !t.parentId)
    .map((t) => ({ id: t.id, title: t.title, blockers: leanBlocked(t, byId) }))
    .filter((t) => t.blockers.length > 0)
    .slice(0, 10);

  const links = listShareLinksForProject(project.id).filter((l) => !l.revokedAt);
  const activeShareLinks = links.slice(0, 5).map((l: ProjectShareLink) => ({
    id: l.id,
    token: l.token,
    publicUrl: sharePublicUrl(l.token),
    expiresAt: l.expiresAt,
  }));

  const lines = [
    `*Comité — ${project.name}*`,
    `Santé : \`${steering.health}\` · ${steering.overdueCount} en retard · ${steering.completionRatio ?? "—"}% complétion`,
    overdueTasks.length
      ? `*Retards* (${overdueTasks.length}) :\n${overdueTasks
          .slice(0, 8)
          .map((t) => `• ${t.title} (\`${t.id}\`)`)
          .join("\n")}`
      : "_Aucun retard actif._",
    blockedTasks.length
      ? `*Bloquées* (${blockedTasks.length}) :\n${blockedTasks
          .slice(0, 5)
          .map((t) => `• ${t.title} ← ${t.blockers.map((b) => b.title).join(", ")}`)
          .join("\n")}`
      : "_Aucune tâche bloquée._",
    activeShareLinks.length
      ? `Lien(s) partage : ${activeShareLinks.map((l) => l.publicUrl).join(" · ")}`
      : "_Pas de lien de partage actif — confirmez dans l’app pour en créer un._",
  ];

  return {
    command: "committee",
    projectId: project.id,
    projectName: project.name,
    steering,
    overdueTasks,
    blockedTasks,
    activeShareLinks,
    canCreateShareLink: canEditProject(uid, email, project),
    summaryMarkdown: lines.join("\n"),
  };
}

/**
 * Create a 7-day read-only share link after UI confirm.
 */
export function applyCommitteeShare(
  uid: string,
  email: string,
  projectId: string,
): { link: ProjectShareLink; publicUrl: string } {
  const link = createProjectShareLink(uid, email, projectId, {
    label: "Comité PMO",
    expiryDays: 7,
    tabs: ["pilotage", "kanban", "gantt"],
  });
  return { link, publicUrl: sharePublicUrl(link.token) };
}

/**
 * Preview « Planifie ma semaine » — focus + proposed slots (no booking).
 */
export async function previewPlanWeek(uid: string, email: string): Promise<PlanWeekPreview> {
  const now = new Date();
  const focusTodos = await getMyWeekFocus(uid, now, 15);
  const focus = digestTodosToRows(focusTodos, now);

  const [mine, assigned] = await Promise.all([listTodos(uid), listAssignedToMe(uid)]);
  const seen = new Set<string>();
  const unscheduled = [...mine, ...assigned]
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return (
        t.status === "active" &&
        !t.parentId &&
        !t.scheduledSlot?.start &&
        (!t.assignedTo || t.assignedTo === uid || t.userId === uid)
      );
    })
    .sort((a, b) => {
      const pr = (p: Todo["priority"]) => (p === "high" ? 0 : p === "medium" ? 1 : 2);
      return pr(a.priority) - pr(b.priority);
    })
    .slice(0, PLAN_WEEK_SLOT_CAP);

  const suggestions: PlanWeekSuggestion[] = [];
  const unscheduledWithoutSlot: { todoId: string; title: string; reason: string }[] = [];

  for (const todo of unscheduled) {
    try {
      const proposal = await proposeSlotsForTodo(uid, email, todo.id);
      const top = proposal.slots[0] ?? (proposal.suggestedSlot
        ? {
            start: proposal.suggestedSlot.start,
            end: proposal.suggestedSlot.end,
            label: "Suggestion",
          }
        : null);
      if (top) {
        suggestions.push({
          todoId: todo.id,
          title: todo.title,
          proposedStart: top.start,
          proposedEnd: top.end,
          label: "label" in top && typeof top.label === "string" ? top.label : "Créneau proposé",
        });
      } else {
        unscheduledWithoutSlot.push({
          todoId: todo.id,
          title: todo.title,
          reason: "Aucun créneau libre trouvé",
        });
      }
    } catch (err) {
      unscheduledWithoutSlot.push({
        todoId: todo.id,
        title: todo.title,
        reason: (err as Error).message || "Impossible de proposer un créneau",
      });
    }
  }

  const lines = [
    `*Planifie ma semaine* — ${focus.length} en focus`,
    suggestions.length
      ? `*Créneaux proposés* (${suggestions.length}) :\n${suggestions
          .map(
            (s) =>
              `• *${s.title}* \`${s.todoId}\` → ${s.proposedStart} → ${s.proposedEnd}`,
          )
          .join("\n")}`
      : "_Aucune proposition de créneau._",
    unscheduledWithoutSlot.length
      ? `_Sans créneau_ : ${unscheduledWithoutSlot.map((u) => u.title).join(", ")}`
      : "",
    "_Confirmez les réservations dans l’app Wroket (aucune réservation via slash)._",
  ].filter(Boolean);

  return {
    command: "plan-week",
    focus,
    suggestions,
    unscheduledWithoutSlot,
    summaryMarkdown: lines.join("\n"),
  };
}

export type PlanWeekBookItem = { todoId: string; start: string; end: string };

export type PlanWeekApplyResult = {
  booked: { todoId: string; start: string; end: string }[];
  conflicts: {
    todoId: string;
    code: string;
    conflicts?: { id: string; title: string; start: string; end: string }[];
  }[];
  errors: { todoId: string; message: string }[];
};

/**
 * Book proposed slots after UI confirm. `force` overrides calendar conflicts.
 */
export async function applyPlanWeekBooks(
  uid: string,
  email: string,
  bookings: PlanWeekBookItem[],
  force = false,
): Promise<PlanWeekApplyResult> {
  if (!Array.isArray(bookings) || bookings.length === 0) {
    throw new ValidationError("Aucune réservation à appliquer", "ASSIST_BOOKINGS_EMPTY");
  }
  if (bookings.length > PLAN_WEEK_SLOT_CAP) {
    throw new ValidationError(
      `Maximum ${PLAN_WEEK_SLOT_CAP} réservations à la fois`,
      "ASSIST_BOOKINGS_TOO_MANY",
    );
  }

  const booked: PlanWeekApplyResult["booked"] = [];
  const conflicts: PlanWeekApplyResult["conflicts"] = [];
  const errors: PlanWeekApplyResult["errors"] = [];

  for (const b of bookings) {
    const todoId = typeof b.todoId === "string" ? b.todoId.trim() : "";
    const start = typeof b.start === "string" ? b.start : "";
    const end = typeof b.end === "string" ? b.end : "";
    if (!todoId || !start || !end) {
      errors.push({ todoId: todoId || "?", message: "todoId/start/end requis" });
      continue;
    }
    try {
      const result = await bookTodoSlot(uid, email, todoId, { start, end, force });
      if (!result.ok) {
        conflicts.push({
          todoId,
          code: result.code,
          conflicts: result.conflicts,
        });
        continue;
      }
      booked.push({ todoId, start, end });
    } catch (err) {
      errors.push({ todoId, message: (err as Error).message || "Erreur réservation" });
    }
  }

  return { booked, conflicts, errors };
}

/**
 * Preview « Résume les risques » — team risk + personal overdue.
 */
export async function previewRisks(uid: string, _email: string): Promise<RisksPreview> {
  const now = new Date();
  const [risk, overdueTodos] = await Promise.all([
    getTeamRiskRows(uid, now),
    getOverdueTodos(uid, now, 10),
  ]);
  const overdueTasks = digestTodosToRows(overdueTodos, now);

  const lines: string[] = [];
  if (!risk.hasTeams) {
    lines.push("_Pas d’équipe — risques projet d’équipe indisponibles._");
  } else if (risk.rows.length === 0) {
    lines.push("_Aucun projet d’équipe en risque._");
  } else {
    lines.push(
      `*Risques équipe* (${risk.rows.length}) :`,
      ...risk.rows.map(
        (r) => `• *${r.name}* — \`${r.health}\` · ${r.overdueCount} en retard · \`${r.projectId}\``,
      ),
    );
  }
  if (overdueTasks.length) {
    lines.push(
      `*Vos retards* (${overdueTasks.length}) :`,
      ...overdueTasks.map((t) => `• ${t.title} (\`${t.id}\`)`),
    );
  } else {
    lines.push("_Aucun retard personnel._");
  }

  return {
    command: "risks",
    hasTeams: risk.hasTeams,
    projects: risk.rows,
    overdueTasks,
    summaryMarkdown: lines.join("\n"),
  };
}
