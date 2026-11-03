import { findUserByEmail, type AuthUser } from "../authService";
import { runTaskAction } from "../chatChannel";
import {
  listCollaborators,
  listKnownContactEmails,
  listUserTeams,
} from "../teamService";
import { getActiveBlockersForTodo, normalizeBlockedByTodoIds } from "../todoDependencyService";
import { findTodoForUser, updateTodo } from "../todoService";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { requireString } from "./types";

export const collaborationToolDefs: McpToolDef[] = [
  {
    name: "list_teams_and_collaborators",
    description:
      "List the user's teams, team members, personal collaborators, and known contact emails (useful before assigning tasks or creating team projects).",
    requiredScope: "projects:read",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "assign_todo",
    description:
      "Assign or unassign a task to a collaborator by email (sets assignmentStatus to 'pending' and notifies the assignee).",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Task id" },
        assigneeEmail: {
          type: ["string", "null"],
          description: "Email of the Wroket user to assign the task to, or null to unassign",
        },
      },
      required: ["todoId", "assigneeEmail"],
    },
  },
  {
    name: "respond_task_assignment",
    description:
      "Accept or decline a task assigned to the authenticated user.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Task id" },
        decision: {
          type: "string",
          enum: ["accept", "decline"],
          description: "Whether to accept or decline the assignment",
        },
      },
      required: ["todoId", "decision"],
    },
  },
  {
    name: "set_todo_blockers",
    description:
      "Set or clear task dependencies (blockedByTodoIds) for a project task. Validates against cycles and cross-project links.",
    requiredScope: "todos:write",
    inputSchema: {
      type: "object",
      properties: {
        todoId: { type: "string", description: "Task id" },
        blockedByTodoIds: {
          type: "array",
          items: { type: "string" },
          description: "Ids of tasks in the same project that block this task (empty array to clear)",
        },
      },
      required: ["todoId", "blockedByTodoIds"],
    },
  },
];

function listTeamsAndCollaboratorsHandler(user: AuthUser, _args: Record<string, unknown>) {
  const teams = listUserTeams(user.uid, user.email).map((t) => ({
    id: t.id,
    name: t.name,
    ownerUid: t.ownerUid,
    members: t.members,
    collaborators: t.collaborators ?? [],
  }));
  const collaborators = listCollaborators(user.uid);
  const knownContacts = listKnownContactEmails(user.uid, user.email);
  return {
    teams,
    collaborators,
    knownContacts,
  };
}

async function assignTodoHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const rawEmail = args.assigneeEmail;

  let assignedTo: string | null = null;
  let assigneeEmail: string | null = null;

  if (rawEmail !== null && rawEmail !== undefined) {
    if (typeof rawEmail !== "string" || !rawEmail.trim()) {
      throw new ValidationError("assigneeEmail doit être un email valide ou null");
    }
    const target = findUserByEmail(rawEmail.trim().toLowerCase());
    if (!target) {
      throw new NotFoundError(`Aucun compte Wroket trouvé pour ${rawEmail.trim()}`);
    }
    assignedTo = target.uid;
    assigneeEmail = target.email;
  }

  const updated = await updateTodo(user.uid, user.email, todoId, { assignedTo });
  return {
    id: updated.id,
    title: updated.title,
    assignedTo: updated.assignedTo ?? null,
    assigneeEmail,
    assignmentStatus: updated.assignmentStatus ?? null,
  };
}

async function respondTaskAssignmentHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  const decision = args.decision;
  if (decision !== "accept" && decision !== "decline") {
    throw new ValidationError("decision doit être 'accept' ou 'decline'");
  }
  const result = await runTaskAction({
    actorUid: user.uid,
    targetUid: user.uid,
    todoId,
    action: decision,
  });
  if (!result.ok) {
    throw new ValidationError(result.message);
  }
  const found = await findTodoForUser(user.uid, todoId);
  return {
    ok: true,
    message: result.message,
    todoId,
    assignmentStatus: found?.todo.assignmentStatus ?? decision,
  };
}

async function setTodoBlockersHandler(user: AuthUser, args: Record<string, unknown>) {
  const todoId = requireString(args, "todoId");
  if (!Array.isArray(args.blockedByTodoIds)) {
    throw new ValidationError("blockedByTodoIds doit être un tableau d'identifiants");
  }
  const blockedByTodoIds = normalizeBlockedByTodoIds(args.blockedByTodoIds);
  const updated = await updateTodo(user.uid, user.email, todoId, { blockedByTodoIds });
  const activeBlockers = await getActiveBlockersForTodo(updated);
  return {
    id: updated.id,
    title: updated.title,
    blockedByTodoIds: updated.blockedByTodoIds ?? [],
    activeBlockers,
  };
}

export const collaborationHandlers: Record<string, McpToolHandler> = {
  list_teams_and_collaborators: listTeamsAndCollaboratorsHandler,
  assign_todo: assignTodoHandler,
  respond_task_assignment: respondTaskAssignmentHandler,
  set_todo_blockers: setTodoBlockersHandler,
};
