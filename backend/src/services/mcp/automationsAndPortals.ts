import type { AuthUser } from "../authService";
import {
  createClientPortal,
  listClientPortalsForOwner,
  revokeClientPortal,
} from "../clientPortalService";
import {
  createAutomationRule,
  deleteAutomationRule,
  listAutomationRulesForOwner,
  updateAutomationRule,
  type AutomationAction,
  type AutomationTrigger,
} from "../projectAutomationService";
import {
  createProjectShareLink,
  listShareLinksForProject,
  revokeProjectShareLink,
  type ShareLinkExpiryDays,
  type ShareLinkTab,
} from "../projectShareLinkService";
import { ValidationError } from "../../utils/errors";
import type { McpToolDef, McpToolHandler } from "./types";
import { optionalString, requireString } from "./types";

const FRONTEND_BASE = (process.env.FRONTEND_URL ?? "https://wroket.com").replace(/\/$/, "");

export const automationsAndPortalsToolDefs: McpToolDef[] = [
  {
    name: "list_automation_rules",
    description:
      "List the user's project automation rules (e.g. auto-tag, auto-priority, or auto-assign on task creation/completion/deadline).",
    requiredScope: "projects:read",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_automation_rule",
    description:
      "Create a project automation rule (Small teams+). Triggers: 'todo_created' | 'todo_completed' | 'deadline_approaching'. Actions: 'add_tag' | 'set_priority' | 'assign'.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Rule name" },
        projectId: { type: ["string", "null"], description: "Project id (or null for all projects)" },
        trigger: {
          type: "string",
          enum: ["todo_created", "todo_completed", "deadline_approaching"],
        },
        action: {
          type: "string",
          enum: ["add_tag", "set_priority", "assign"],
        },
        actionValue: {
          type: "string",
          description: "Tag name, priority ('low'|'medium'|'high'), or assignee uid",
        },
      },
      required: ["name", "trigger", "action", "actionValue"],
    },
  },
  {
    name: "update_automation_rule",
    description: "Enable/disable, rename, or update the actionValue of an automation rule.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        ruleId: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean" },
        actionValue: { type: "string" },
      },
      required: ["ruleId"],
    },
  },
  {
    name: "delete_automation_rule",
    description: "Delete a project automation rule by id.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        ruleId: { type: "string" },
      },
      required: ["ruleId"],
    },
  },
  {
    name: "manage_project_share_links",
    description:
      "List, create, or revoke public read-only share links (/share/project/:token) for a project.",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "create", "revoke"],
        },
        projectId: { type: "string", description: "Project id" },
        linkId: { type: "string", description: "Share link id (required when action='revoke')" },
        label: { type: "string", description: "Optional label when creating a link" },
        expiryDays: {
          type: ["number", "null"],
          description: "7, 30, 90, or null (no expiry). Default 30.",
        },
        tabs: {
          type: "array",
          items: { type: "string", enum: ["pilotage", "kanban", "gantt"] },
          description: "Allowed public tabs (default: all 3)",
        },
      },
      required: ["action", "projectId"],
    },
  },
  {
    name: "list_client_portals",
    description: "List the user's multi-project Client Portals (/portal/:token).",
    requiredScope: "projects:read",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "manage_client_portal",
    description:
      "Create or revoke a multi-project stakeholder Client Portal (/portal/:token — Large teams+ / Early Bird).",
    requiredScope: "projects:write",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "revoke"] },
        portalId: { type: "string", description: "Portal id (required when action='revoke')" },
        label: { type: "string", description: "Portal display label" },
        projectIds: {
          type: "array",
          items: { type: "string" },
          description: "Project ids to include in the portal (required when action='create')",
        },
        expiryDays: {
          type: ["number", "null"],
          description: "7, 30, 90, or null",
        },
        displayName: { type: "string", description: "Optional branding display name" },
      },
      required: ["action"],
    },
  },
];

function listAutomationRulesHandler(user: AuthUser, _args: Record<string, unknown>) {
  return { rules: listAutomationRulesForOwner(user.uid) };
}

function createAutomationRuleHandler(user: AuthUser, args: Record<string, unknown>) {
  const name = requireString(args, "name");
  const trigger = requireString(args, "trigger") as AutomationTrigger;
  const action = requireString(args, "action") as AutomationAction;
  const actionValue = requireString(args, "actionValue");
  const projectId = args.projectId === null ? null : optionalString(args, "projectId") ?? null;
  const rule = createAutomationRule(user.uid, {
    name,
    projectId,
    trigger,
    action,
    actionValue,
  });
  return { rule };
}

function updateAutomationRuleHandler(user: AuthUser, args: Record<string, unknown>) {
  const ruleId = requireString(args, "ruleId");
  const rule = updateAutomationRule(user.uid, ruleId, {
    name: optionalString(args, "name"),
    enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
    actionValue: optionalString(args, "actionValue"),
  });
  return { rule };
}

function deleteAutomationRuleHandler(user: AuthUser, args: Record<string, unknown>) {
  const ruleId = requireString(args, "ruleId");
  deleteAutomationRule(user.uid, ruleId);
  return { deleted: true, ruleId };
}

function parseExpiryDays(raw: unknown): ShareLinkExpiryDays {
  if (raw === null) return null;
  if (raw === 7 || raw === 30 || raw === 90) return raw;
  return 30;
}

function manageProjectShareLinksHandler(user: AuthUser, args: Record<string, unknown>) {
  const action = requireString(args, "action");
  const projectId = requireString(args, "projectId");

  if (action === "list") {
    const links = listShareLinksForProject(projectId).map((l) => ({
      ...l,
      publicUrl: `${FRONTEND_BASE}/share/project/${l.token}`,
    }));
    return { projectId, links };
  }

  if (action === "create") {
    const tabs = Array.isArray(args.tabs)
      ? args.tabs.filter(
          (t): t is ShareLinkTab => t === "pilotage" || t === "kanban" || t === "gantt",
        )
      : undefined;
    const link = createProjectShareLink(user.uid, user.email, projectId, {
      label: optionalString(args, "label") ?? null,
      expiryDays: parseExpiryDays(args.expiryDays),
      tabs,
    });
    return {
      created: true,
      link,
      publicUrl: `${FRONTEND_BASE}/share/project/${link.token}`,
    };
  }

  if (action === "revoke") {
    const linkId = requireString(args, "linkId");
    const link = revokeProjectShareLink(user.uid, user.email, projectId, linkId);
    return { revoked: true, link };
  }

  throw new ValidationError("action invalide");
}

function listClientPortalsHandler(user: AuthUser, _args: Record<string, unknown>) {
  const portals = listClientPortalsForOwner(user.uid).map((p) => ({
    ...p,
    publicUrl: `${FRONTEND_BASE}/portal/${p.token}`,
  }));
  return { portals };
}

function manageClientPortalHandler(user: AuthUser, args: Record<string, unknown>) {
  const action = requireString(args, "action");
  if (action === "create") {
    const projectIds = Array.isArray(args.projectIds)
      ? args.projectIds.filter((id): id is string => typeof id === "string")
      : [];
    const portal = createClientPortal(user.uid, user.email, {
      label: optionalString(args, "label") ?? null,
      projectIds,
      expiryDays: parseExpiryDays(args.expiryDays),
      branding: {
        displayName: optionalString(args, "displayName") ?? null,
      },
    });
    return {
      created: true,
      portal,
      publicUrl: `${FRONTEND_BASE}/portal/${portal.token}`,
    };
  }

  if (action === "revoke") {
    const portalId = requireString(args, "portalId");
    const portal = revokeClientPortal(user.uid, portalId);
    return { revoked: true, portal };
  }

  throw new ValidationError("action invalide");
}

export const automationsAndPortalsHandlers: Record<string, McpToolHandler> = {
  list_automation_rules: listAutomationRulesHandler,
  create_automation_rule: createAutomationRuleHandler,
  update_automation_rule: updateAutomationRuleHandler,
  delete_automation_rule: deleteAutomationRuleHandler,
  manage_project_share_links: manageProjectShareLinksHandler,
  list_client_portals: listClientPortalsHandler,
  manage_client_portal: manageClientPortalHandler,
};
