import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, PaymentRequiredError, ValidationError } from "../utils/errors";
import { getEntitlementsForUid } from "./authService";
import type { Todo } from "./todoService";

export type AutomationTrigger = "todo_created" | "todo_completed" | "deadline_approaching";
export type AutomationAction = "add_tag" | "set_priority" | "assign";

export interface AutomationRuleLogEntry {
  at: string;
  todoId: string;
  message: string;
}

export interface ProjectAutomationRule {
  id: string;
  ownerUid: string;
  projectId: string | null;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  /** Action params: tag string, priority, or assignee uid */
  actionValue: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  runLog: AutomationRuleLogEntry[];
}

const rulesById = new Map<string, ProjectAutomationRule>();

function hydrate(): void {
  rulesById.clear();
  const raw = getStore().projectAutomationRules;
  if (!raw || typeof raw !== "object") return;
  for (const [id, row] of Object.entries(raw)) {
    const r = row as ProjectAutomationRule;
    rulesById.set(r?.id ?? id, { ...r, id: r?.id ?? id });
  }
}

if (getStore().projectAutomationRules) hydrate();

function persist(): void {
  const obj: Record<string, ProjectAutomationRule> = {};
  rulesById.forEach((r, id) => {
    obj[id] = r;
  });
  getStore().projectAutomationRules = obj;
  scheduleSave("projectAutomationRules");
}

export function reloadProjectAutomationRulesFromStore(): void {
  hydrate();
}

function assertAutomationEntitlement(uid: string): void {
  if (!getEntitlementsForUid(uid).integrations) {
    throw new PaymentRequiredError(
      "Les automatisations avancées nécessitent Small teams+.",
      "AUTOMATION_PLAN_REQUIRED",
    );
  }
}

export function listAutomationRulesForOwner(uid: string): ProjectAutomationRule[] {
  return [...rulesById.values()]
    .filter((r) => r.ownerUid === uid)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function purgeAutomationRulesForOwner(uid: string): number {
  let n = 0;
  for (const [id, r] of [...rulesById.entries()]) {
    if (r.ownerUid === uid) {
      rulesById.delete(id);
      n++;
    }
  }
  if (n > 0) persist();
  return n;
}

export function createAutomationRule(
  uid: string,
  input: {
    name: string;
    projectId?: string | null;
    trigger: AutomationTrigger;
    action: AutomationAction;
    actionValue: string;
  },
): ProjectAutomationRule {
  assertAutomationEntitlement(uid);
  const triggers: AutomationTrigger[] = ["todo_created", "todo_completed", "deadline_approaching"];
  const actions: AutomationAction[] = ["add_tag", "set_priority", "assign"];
  if (!triggers.includes(input.trigger)) throw new ValidationError("Trigger invalide");
  if (!actions.includes(input.action)) throw new ValidationError("Action invalide");
  const name = input.name?.trim();
  if (!name) throw new ValidationError("Nom requis");
  const value = String(input.actionValue ?? "").trim();
  if (!value) throw new ValidationError("Valeur d'action requise");

  const now = new Date().toISOString();
  const rule: ProjectAutomationRule = {
    id: crypto.randomUUID(),
    ownerUid: uid,
    projectId: input.projectId ?? null,
    name: name.substring(0, 120),
    trigger: input.trigger,
    action: input.action,
    actionValue: value.substring(0, 200),
    enabled: true,
    createdAt: now,
    lastRunAt: null,
    runLog: [],
  };
  rulesById.set(rule.id, rule);
  persist();
  return rule;
}

export function updateAutomationRule(
  uid: string,
  ruleId: string,
  patch: Partial<{ name: string; enabled: boolean; actionValue: string }>,
): ProjectAutomationRule {
  assertAutomationEntitlement(uid);
  const rule = rulesById.get(ruleId);
  if (!rule || rule.ownerUid !== uid) throw new NotFoundError("Règle introuvable");
  if (patch.name !== undefined) rule.name = patch.name.trim().substring(0, 120) || rule.name;
  if (patch.enabled !== undefined) rule.enabled = patch.enabled;
  if (patch.actionValue !== undefined) rule.actionValue = patch.actionValue.trim().substring(0, 200);
  rulesById.set(rule.id, rule);
  persist();
  return rule;
}

export function deleteAutomationRule(uid: string, ruleId: string): void {
  assertAutomationEntitlement(uid);
  const rule = rulesById.get(ruleId);
  if (!rule || rule.ownerUid !== uid) throw new NotFoundError("Règle introuvable");
  rulesById.delete(ruleId);
  persist();
}

export type AutomationPatch = Partial<Pick<Todo, "tags" | "priority" | "assignedTo">>;

/**
 * Evaluate enabled rules for a trigger; returns patches to apply (caller applies via updateTodo).
 */
export function evaluateAutomationRules(
  ownerUid: string,
  trigger: AutomationTrigger,
  todo: Todo,
): { ruleId: string; patch: AutomationPatch }[] {
  const matches = [...rulesById.values()].filter(
    (r) =>
      r.enabled &&
      r.ownerUid === ownerUid &&
      r.trigger === trigger &&
      (r.projectId == null || r.projectId === todo.projectId),
  );

  const out: { ruleId: string; patch: AutomationPatch }[] = [];
  const now = new Date().toISOString();

  for (const rule of matches) {
    const patch: AutomationPatch = {};
    if (rule.action === "add_tag") {
      const tags = [...(todo.tags ?? [])];
      if (!tags.includes(rule.actionValue)) tags.push(rule.actionValue);
      patch.tags = tags;
    } else if (rule.action === "set_priority") {
      if (["low", "medium", "high", "urgent"].includes(rule.actionValue)) {
        patch.priority = rule.actionValue as Todo["priority"];
      }
    } else if (rule.action === "assign") {
      patch.assignedTo = rule.actionValue;
    }

    if (Object.keys(patch).length === 0) continue;

    rule.lastRunAt = now;
    rule.runLog = [
      { at: now, todoId: todo.id, message: `${rule.action}=${rule.actionValue}` },
      ...rule.runLog,
    ].slice(0, 20);
    rulesById.set(rule.id, rule);
    out.push({ ruleId: rule.id, patch });
  }

  if (out.length > 0) persist();
  return out;
}

void ForbiddenError;
