import { createTodo, CreateTodoInput, Recurrence, ScheduledSlot, SuggestedSlot } from "./todoService";
import { ValidationError } from "../utils/errors";

const MAX_TASKS = 1000;

function parseCsvToTaskRows(text: string): Array<Record<string, string>> {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new ValidationError("Le CSV doit contenir un en-tête et au moins une ligne");
  const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!headers.includes("title") && !headers.includes("task_title")) {
    throw new ValidationError("Colonne 'title' ou 'task_title' requise");
  }
  return lines.slice(1).map((line) => {
    const fields = line.split(/[,;]/).map((f) => f.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h === "task_title" ? "title" : h] = fields[i] ?? "";
    });
    return row;
  });
}

export function parseTaskImportBuffer(buffer: Buffer, originalname: string, mimetype: string): Record<string, unknown>[] {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (originalname.endsWith(".json") || mimetype === "application/json") {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new ValidationError("Le JSON doit contenir un tableau de tâches");
    return parsed as Record<string, unknown>[];
  }
  return parseCsvToTaskRows(text) as unknown as Record<string, unknown>[];
}

function pickStr(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickNum(row: Record<string, unknown>, keys: string[]): number | null | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return undefined;
}

function parseTags(row: Record<string, unknown>): string[] {
  const t = row.tags;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
  if (typeof t === "string") return t.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function parseRecurrence(row: Record<string, unknown>): Recurrence | null | undefined {
  const raw = row.recurrence ?? row.recurrence_json;
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Recurrence;
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Recurrence;
    } catch {
      throw new ValidationError("recurrence JSON invalide");
    }
  }
  return undefined;
}

function parseScheduledFromRow(row: Record<string, unknown>): ScheduledSlot | null | undefined {
  const nested = row.scheduledSlot ?? row.scheduled_slot;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const o = nested as Record<string, unknown>;
    return {
      start: String(o.start ?? ""),
      end: String(o.end ?? ""),
      calendarEventId:
        o.calendarEventId === undefined || o.calendarEventId === null
          ? null
          : String(o.calendarEventId),
    };
  }
  const start = pickStr(row, ["scheduled_start", "scheduledstart", "scheduled_start_iso"]);
  const end = pickStr(row, ["scheduled_end", "scheduledend"]);
  const ev = pickStr(row, ["calendar_event_id", "calendareventid", "calendar_event_id"]);
  if (!start && !end && !ev) return undefined;
  if (!start || !end) throw new ValidationError("scheduledStart et scheduledEnd requis ensemble");
  return {
    start,
    end,
    calendarEventId: ev ?? null,
  };
}

function parseSuggestedFromRow(row: Record<string, unknown>): SuggestedSlot | null | undefined {
  const nested = row.suggestedSlot ?? row.suggested_slot;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const o = nested as Record<string, unknown>;
    return { start: String(o.start ?? ""), end: String(o.end ?? "") };
  }
  const start = pickStr(row, ["suggested_start", "suggestedstart"]);
  const end = pickStr(row, ["suggested_end", "suggestedend"]);
  if (!start && !end) return undefined;
  if (!start || !end) throw new ValidationError("suggestedStart et suggestedEnd requis ensemble");
  return { start, end };
}

/**
 * Build CreateTodoInput from an export row or CSV row (import always allows past deadlines).
 */
export function coerceImportRowToCreateInput(row: Record<string, unknown>): CreateTodoInput {
  const title = pickStr(row, ["title", "task_title"]) ?? "";
  if (!title) throw new ValidationError("Titre requis");

  const priorityRaw = pickStr(row, ["priority"]) ?? "medium";
  const priority = (["low", "medium", "high"].includes(priorityRaw) ? priorityRaw : "medium") as CreateTodoInput["priority"];

  const effortRaw = pickStr(row, ["effort"]) ?? "medium";
  const effort = (["light", "medium", "heavy"].includes(effortRaw) ? effortRaw : "medium") as NonNullable<CreateTodoInput["effort"]>;

  const em = pickNum(row, ["estimatedMinutes", "estimated_minutes"]);
  const estimatedMinutes = em === undefined ? null : em;

  const startDate = pickStr(row, ["startDate", "start_date"]) ?? null;
  const deadline = pickStr(row, ["deadline", "due"]) ?? null;

  const statusRaw = pickStr(row, ["status"]);
  const status =
    statusRaw && ["active", "completed", "cancelled", "deleted"].includes(statusRaw)
      ? (statusRaw as CreateTodoInput["status"])
      : undefined;

  const asRaw = pickStr(row, ["assignmentStatus", "assignment_status"]);
  const assignmentStatus =
    asRaw && ["pending", "accepted", "declined"].includes(asRaw)
      ? (asRaw as NonNullable<CreateTodoInput["assignmentStatus"]>)
      : undefined;

  const sortN = pickNum(row, ["sortOrder", "sort_order"]);
  const sortOrder = sortN === undefined ? null : sortN;

  const scheduledSlot = parseScheduledFromRow(row);
  const suggestedSlot = parseSuggestedFromRow(row);

  const recurrence = parseRecurrence(row);

  const input: CreateTodoInput = {
    title,
    priority,
    effort,
    estimatedMinutes,
    startDate,
    deadline,
    tags: parseTags(row),
    parentId: pickStr(row, ["parentId", "parent_id"]) ?? null,
    projectId: pickStr(row, ["projectId", "project_id"]) ?? null,
    phaseId: pickStr(row, ["phaseId", "phase_id"]) ?? null,
    assignedTo: pickStr(row, ["assignedTo", "assigned_to"]) ?? null,
    sortOrder,
    allowPastDeadline: true,
    status,
    assignmentStatus,
  };

  if (recurrence !== undefined) {
    input.recurrence = recurrence ?? null;
  }
  if (scheduledSlot !== undefined) {
    input.scheduledSlot = scheduledSlot ?? null;
  }
  if (suggestedSlot !== undefined) {
    input.suggestedSlot = suggestedSlot ?? null;
  }

  return input;
}

export function previewTaskImportRows(rows: Record<string, unknown>[]): {
  total: number;
  errors: Array<{ row: number; message: string }>;
  validInputs: CreateTodoInput[];
} {
  const errors: Array<{ row: number; message: string }> = [];
  const validInputs: CreateTodoInput[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      validInputs.push(coerceImportRowToCreateInput(rows[i]));
    } catch (err) {
      errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { total: rows.length, errors, validInputs };
}

export async function executeTaskImport(
  uid: string,
  email: string,
  inputs: CreateTodoInput[],
): Promise<{ created: number; errors: Array<{ row: number; message: string }>; total: number }> {
  if (inputs.length === 0) throw new ValidationError("Aucune tâche à importer");
  if (inputs.length > MAX_TASKS) throw new ValidationError(`Maximum ${MAX_TASKS} tâches par import`);

  let created = 0;
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < inputs.length; i++) {
    try {
      await createTodo(uid, email, inputs[i]);
      created++;
    } catch (err) {
      errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : "Erreur",
      });
    }
  }

  return { created, errors, total: inputs.length };
}
