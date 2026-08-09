import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { ForbiddenError, NotFoundError, PaymentRequiredError, ValidationError } from "../utils/errors";
import { getEntitlementsForUid } from "./authService";
import { findTodoForUser } from "./todoService";

export type OkrStatus = "active" | "completed" | "abandoned";

export interface OkrKeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string | null;
  linkedTodoIds: string[];
  linkedProjectIds: string[];
}

export interface OkrObjective {
  id: string;
  ownerUid: string;
  teamId: string | null;
  title: string;
  description: string;
  status: OkrStatus;
  keyResults: OkrKeyResult[];
  createdAt: string;
  updatedAt: string;
}

const byId = new Map<string, OkrObjective>();

function hydrate(): void {
  byId.clear();
  const raw = getStore().okrs;
  if (!raw || typeof raw !== "object") return;
  for (const [id, row] of Object.entries(raw)) {
    const o = row as OkrObjective;
    byId.set(o?.id ?? id, { ...o, id: o?.id ?? id });
  }
}

if (getStore().okrs) hydrate();

function persist(): void {
  const obj: Record<string, OkrObjective> = {};
  byId.forEach((o, id) => {
    obj[id] = o;
  });
  getStore().okrs = obj;
  scheduleSave("okrs");
}

export function reloadOkrsFromStore(): void {
  hydrate();
}

function assertOkrEntitlement(uid: string): void {
  const e = getEntitlementsForUid(uid);
  if (!e.teamReporting && !e.integrations) {
    throw new PaymentRequiredError(
      "Les OKR nécessitent le palier Small teams ou supérieur.",
      "OKR_PLAN_REQUIRED",
    );
  }
}

export function computeOkrProgress(objective: OkrObjective): number {
  if (objective.keyResults.length === 0) return 0;
  const ratios = objective.keyResults.map((kr) => {
    if (kr.target <= 0) return 0;
    return Math.min(1, Math.max(0, kr.current / kr.target));
  });
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100);
}

export function listOkrsForOwner(uid: string): OkrObjective[] {
  return [...byId.values()]
    .filter((o) => o.ownerUid === uid)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function purgeOkrsForOwner(uid: string): number {
  let n = 0;
  for (const [id, o] of [...byId.entries()]) {
    if (o.ownerUid === uid) {
      byId.delete(id);
      n++;
    }
  }
  if (n > 0) persist();
  return n;
}

export function createOkr(
  uid: string,
  input: {
    title: string;
    description?: string;
    teamId?: string | null;
    keyResults?: Omit<OkrKeyResult, "id">[];
  },
): OkrObjective {
  assertOkrEntitlement(uid);
  const title = input.title?.trim();
  if (!title) throw new ValidationError("Titre requis");
  const now = new Date().toISOString();
  const objective: OkrObjective = {
    id: crypto.randomUUID(),
    ownerUid: uid,
    teamId: input.teamId ?? null,
    title: title.substring(0, 200),
    description: (input.description ?? "").substring(0, 2000),
    status: "active",
    keyResults: (input.keyResults ?? []).map((kr) => ({
      id: crypto.randomUUID(),
      title: String(kr.title ?? "").substring(0, 200),
      target: Number(kr.target) || 100,
      current: Number(kr.current) || 0,
      unit: kr.unit ?? "%",
      linkedTodoIds: kr.linkedTodoIds ?? [],
      linkedProjectIds: kr.linkedProjectIds ?? [],
    })),
    createdAt: now,
    updatedAt: now,
  };
  byId.set(objective.id, objective);
  persist();
  return objective;
}

export function updateOkr(
  uid: string,
  okrId: string,
  patch: Partial<{
    title: string;
    description: string;
    status: OkrStatus;
    teamId: string | null;
    keyResults: OkrKeyResult[];
  }>,
): OkrObjective {
  assertOkrEntitlement(uid);
  const o = byId.get(okrId);
  if (!o || o.ownerUid !== uid) throw new NotFoundError("OKR introuvable");
  if (patch.title !== undefined) o.title = patch.title.trim().substring(0, 200) || o.title;
  if (patch.description !== undefined) o.description = patch.description.substring(0, 2000);
  if (patch.status !== undefined) o.status = patch.status;
  if (patch.teamId !== undefined) o.teamId = patch.teamId;
  if (patch.keyResults) {
    o.keyResults = patch.keyResults.map((kr) => ({
      id: kr.id || crypto.randomUUID(),
      title: String(kr.title ?? "").substring(0, 200),
      target: Number(kr.target) || 100,
      current: Number(kr.current) || 0,
      unit: kr.unit ?? "%",
      linkedTodoIds: kr.linkedTodoIds ?? [],
      linkedProjectIds: kr.linkedProjectIds ?? [],
    }));
  }
  o.updatedAt = new Date().toISOString();
  byId.set(o.id, o);
  persist();
  return o;
}

export function deleteOkr(uid: string, okrId: string): void {
  assertOkrEntitlement(uid);
  const o = byId.get(okrId);
  if (!o || o.ownerUid !== uid) throw new NotFoundError("OKR introuvable");
  byId.delete(okrId);
  persist();
}

/** Sync KR current from linked todo completion ratio when linkedTodoIds present. */
export async function refreshOkrFromTodos(uid: string, userEmail: string, okrId: string): Promise<OkrObjective> {
  assertOkrEntitlement(uid);
  const o = byId.get(okrId);
  if (!o || o.ownerUid !== uid) throw new NotFoundError("OKR introuvable");

  for (const kr of o.keyResults) {
    if (kr.linkedTodoIds.length === 0) continue;
    let done = 0;
    let total = 0;
    for (const todoId of kr.linkedTodoIds) {
      const found = await findTodoForUser(uid, todoId, userEmail);
      if (!found) continue;
      total += 1;
      if (found.todo.status === "completed") done += 1;
    }
    if (total > 0) {
      kr.target = 100;
      kr.current = Math.round((done / total) * 100);
      kr.unit = "%";
    }
  }
  o.updatedAt = new Date().toISOString();
  byId.set(o.id, o);
  persist();
  return o;
}

export function getOkrForOwner(uid: string, okrId: string): OkrObjective {
  const o = byId.get(okrId);
  if (!o || o.ownerUid !== uid) throw new NotFoundError("OKR introuvable");
  return o;
}

export function assertCanAccessOkr(uid: string): void {
  assertOkrEntitlement(uid);
}

// silence unused import if tree-shaken
void ForbiddenError;
