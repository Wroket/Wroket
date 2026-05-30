import crypto from "crypto";

import { getStore, scheduleSave } from "../persistence";
import { NotFoundError, ValidationError } from "../utils/errors";
import type { Priority, Effort } from "./todoService";

export interface TaskTemplate {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  description: string;
  priority: Priority;
  effort: Effort;
  estimatedMinutes: number | null;
  tags: string[];
  subtasks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  emoji?: string;
  description?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  tags?: string[];
  subtasks?: string[];
}

export interface UpdateTemplateInput {
  name?: string;
  emoji?: string;
  description?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  tags?: string[];
  subtasks?: string[];
}

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];
const VALID_EFFORTS: Effort[] = ["light", "medium", "heavy"];
const MAX_TEMPLATES_PER_USER = 30;
const MAX_SUBTASKS = 20;

function getTemplateStore(): Record<string, TaskTemplate[]> {
  const store = getStore();
  if (!store.taskTemplates) store.taskTemplates = {};
  return store.taskTemplates as Record<string, TaskTemplate[]>;
}

function persist(): void {
  scheduleSave("taskTemplates");
}

export function listTemplates(userId: string): TaskTemplate[] {
  const store = getTemplateStore();
  return (store[userId] ?? []).slice().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function createTemplate(userId: string, input: CreateTemplateInput): TaskTemplate {
  if (!input.name?.trim()) throw new ValidationError("Le nom du template est requis.");
  if (input.name.trim().length > 100) throw new ValidationError("Nom trop long (max 100 caractères).");
  if (input.priority && !VALID_PRIORITIES.includes(input.priority)) {
    throw new ValidationError("Priorité invalide.");
  }
  if (input.effort && !VALID_EFFORTS.includes(input.effort)) {
    throw new ValidationError("Effort invalide.");
  }
  if (input.tags && input.tags.length > 10) throw new ValidationError("Trop de tags (max 10).");
  if (input.subtasks && input.subtasks.length > MAX_SUBTASKS) {
    throw new ValidationError(`Trop de sous-tâches (max ${MAX_SUBTASKS}).`);
  }

  const store = getTemplateStore();
  const userTemplates = store[userId] ?? [];
  if (userTemplates.length >= MAX_TEMPLATES_PER_USER) {
    throw new ValidationError(`Limite de ${MAX_TEMPLATES_PER_USER} templates atteinte.`);
  }

  const now = new Date().toISOString();
  const template: TaskTemplate = {
    id: crypto.randomUUID(),
    userId,
    name: input.name.trim(),
    emoji: input.emoji?.trim() || "📋",
    description: input.description?.trim() || "",
    priority: input.priority ?? "medium",
    effort: input.effort ?? "medium",
    estimatedMinutes: input.estimatedMinutes ?? null,
    tags: (input.tags ?? []).map((t) => t.trim().slice(0, 50)).filter(Boolean),
    subtasks: (input.subtasks ?? []).map((s) => s.trim().slice(0, 200)).filter(Boolean),
    createdAt: now,
    updatedAt: now,
  };

  store[userId] = [template, ...userTemplates];
  persist();
  return template;
}

export function updateTemplate(userId: string, templateId: string, input: UpdateTemplateInput): TaskTemplate {
  const store = getTemplateStore();
  const userTemplates = store[userId] ?? [];
  const idx = userTemplates.findIndex((t) => t.id === templateId);
  if (idx === -1) throw new NotFoundError("Template introuvable.");

  const existing = userTemplates[idx];
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new ValidationError("Le nom du template est requis.");
    if (trimmed.length > 100) throw new ValidationError("Nom trop long (max 100 caractères).");
    existing.name = trimmed;
  }
  if (input.emoji !== undefined) existing.emoji = input.emoji.trim() || "📋";
  if (input.description !== undefined) existing.description = input.description.trim();
  if (input.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(input.priority)) throw new ValidationError("Priorité invalide.");
    existing.priority = input.priority;
  }
  if (input.effort !== undefined) {
    if (!VALID_EFFORTS.includes(input.effort)) throw new ValidationError("Effort invalide.");
    existing.effort = input.effort;
  }
  if (input.estimatedMinutes !== undefined) existing.estimatedMinutes = input.estimatedMinutes;
  if (input.tags !== undefined) {
    if (input.tags.length > 10) throw new ValidationError("Trop de tags (max 10).");
    existing.tags = input.tags.map((t) => t.trim().slice(0, 50)).filter(Boolean);
  }
  if (input.subtasks !== undefined) {
    if (input.subtasks.length > MAX_SUBTASKS) throw new ValidationError(`Trop de sous-tâches (max ${MAX_SUBTASKS}).`);
    existing.subtasks = input.subtasks.map((s) => s.trim().slice(0, 200)).filter(Boolean);
  }
  existing.updatedAt = new Date().toISOString();

  store[userId] = userTemplates;
  persist();
  return existing;
}

export function deleteTemplate(userId: string, templateId: string): void {
  const store = getTemplateStore();
  const userTemplates = store[userId] ?? [];
  const idx = userTemplates.findIndex((t) => t.id === templateId);
  if (idx === -1) throw new NotFoundError("Template introuvable.");
  userTemplates.splice(idx, 1);
  store[userId] = userTemplates;
  persist();
}
