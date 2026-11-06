/**
 * Suggest tasks from note text. Nothing is stored.
 * Off unless `TASK_SUGGEST_ENABLED=true`. The note text and the model output are not logged.
 */
import { getGcpAccessToken } from "./gcpAccessToken";
import { getEffectiveEntitlementsForUid } from "./teamService";
import { vertexFailureReason } from "./vertexHttp";
import type { Priority } from "./todoService";
import { AppError, ValidationError } from "../utils/errors";
import { logger } from "../utils/logger";

const DEFAULT_DAILY_LIMIT = 10;
const MAX_TASKS = 25;
const MAX_TEXT = 12_000;
const PRIORITIES = new Set<Priority>(["low", "medium", "high"]);

export interface SuggestedTask {
  title: string;
  deadline: string;
  priority: Priority;
}

const usage = new Map<string, { day: string; count: number }>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyLimit(): number {
  const raw = Number(process.env.TASK_SUGGEST_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_LIMIT;
}

/** True when the kill switch is on and the user has the work-capture entitlement. */
export function isTaskSuggestEnabledFor(uid: string | undefined, email: string | undefined): boolean {
  if (process.env.TASK_SUGGEST_ENABLED !== "true") return false;
  if (!uid) return false;
  return getEffectiveEntitlementsForUid(uid, email ?? "").workCapture;
}

function usedToday(uid: string): number {
  const entry = usage.get(uid);
  return entry && entry.day === today() ? entry.count : 0;
}

function consumeQuota(uid: string): void {
  const limit = dailyLimit();
  const used = usedToday(uid);
  if (used >= limit) {
    throw new AppError(429, `Limite quotidienne de propositions atteinte (${limit})`, "TASK_SUGGEST_QUOTA_EXCEEDED");
  }
  usage.set(uid, { day: today(), count: used + 1 });
}

function refundQuota(uid: string): void {
  const entry = usage.get(uid);
  if (entry && entry.day === today() && entry.count > 0) entry.count -= 1;
}

export function getTaskSuggestConfigFor(uid: string, email: string | undefined): {
  enabled: boolean;
  dailyLimit: number;
  remaining: number;
} {
  const enabled = isTaskSuggestEnabledFor(uid, email);
  const limit = dailyLimit();
  return { enabled, dailyLimit: limit, remaining: enabled ? Math.max(0, limit - usedToday(uid)) : 0 };
}

/** Test hook. */
export function __resetTaskSuggestQuota(): void {
  usage.clear();
}

function deadlineOrEmpty(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Keep a model list inside the product limits. Drops empty titles. */
export function sanitizeTaskSuggestions(raw: unknown): SuggestedTask[] {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rows = Array.isArray(obj.tasks) ? obj.tasks : [];
  const tasks: SuggestedTask[] = [];
  for (const row of rows) {
    if (tasks.length >= MAX_TASKS) break;
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    if (title.length < 2) continue;
    const priority = typeof item.priority === "string" && PRIORITIES.has(item.priority as Priority)
      ? item.priority as Priority
      : "medium";
    tasks.push({ title, deadline: deadlineOrEmpty(item.deadline), priority });
  }
  return tasks;
}

function mockSuggestions(): SuggestedTask[] {
  return [
    { title: "Relire la note", deadline: "", priority: "medium" },
    { title: "Noter la suite", deadline: "", priority: "low" },
  ];
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(trimmed) as unknown;
}

async function vertexSuggestions(text: string): Promise<SuggestedTask[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim();
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT missing");
  const location = process.env.DIAGRAM_VERTEX_LOCATION?.trim() || "global";
  const model = process.env.TASK_SUGGEST_VERTEX_MODEL?.trim()
    || process.env.DIAGRAM_VERTEX_MODEL?.trim()
    || "gemini-3-flash-preview";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url =
    `https://${host}/v1/projects/${encodeURIComponent(project)}` +
    `/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const token = await getGcpAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: "Extract actionable tasks from the note. Reply with JSON only: {\"tasks\":[{\"title\":\"short action\",\"deadline\":\"YYYY-MM-DD or empty\",\"priority\":\"low\"}]}. priority is low, medium or high. Max 25. Keep the note's language. Do not invent work that the note does not imply. If there is no action, return {\"tasks\":[]}.\n\nNote:\n" + text,
          }],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "LOW" },
        },
      }),
    });
    if (!res.ok) throw new Error(await vertexFailureReason(res));
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const reply = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!reply.trim()) throw new Error("empty model response");
    return sanitizeTaskSuggestions(extractJson(reply));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Propose tasks from text the user already wrote. Nothing is stored.
 * @throws AppError TASK_SUGGEST_DISABLED, TASK_SUGGEST_QUOTA_EXCEEDED, TASK_SUGGEST_PROVIDER_ERROR
 */
export async function suggestTasksForUser(input: {
  uid: string;
  email: string | undefined;
  text: string;
  consent: unknown;
  requestId?: string;
}): Promise<{ tasks: SuggestedTask[]; provider: "mock" | "vertex" }> {
  if (!isTaskSuggestEnabledFor(input.uid, input.email)) {
    throw new AppError(503, "La proposition de tâches n'est pas activée pour ce compte", "TASK_SUGGEST_DISABLED");
  }
  if (input.consent !== "yes") {
    throw new ValidationError("Confirmez l'envoi du texte pour proposer des tâches", "TASK_SUGGEST_CONSENT_REQUIRED");
  }
  const text = input.text.replace(/\u0000/g, "").trim().slice(0, MAX_TEXT);
  if (text.length < 2) {
    throw new ValidationError("La note ne contient pas de texte à lire", "TASK_SUGGEST_EMPTY");
  }
  consumeQuota(input.uid);
  const started = Date.now();
  const provider = (process.env.TASK_SUGGEST_PROVIDER ?? "vertex").trim().toLowerCase();
  try {
    const tasks = provider === "mock" ? mockSuggestions() : await vertexSuggestions(text);
    logger.info("task_suggest.ok", {
      requestId: input.requestId,
      uid: input.uid,
      ms: Date.now() - started,
      tasks: tasks.length,
    });
    return { tasks, provider: provider === "mock" ? "mock" : "vertex" };
  } catch (err) {
    refundQuota(input.uid);
    if (err instanceof AppError) throw err;
    if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
      logger.warn("task_suggest.timeout", { requestId: input.requestId, uid: input.uid, ms: Date.now() - started });
      throw new AppError(504, "Proposition trop longue", "TASK_SUGGEST_TIMEOUT");
    }
    logger.warn("task_suggest.provider_error", {
      requestId: input.requestId,
      uid: input.uid,
      ms: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown",
    });
    throw new AppError(502, "Proposition indisponible", "TASK_SUGGEST_PROVIDER_ERROR");
  }
}
