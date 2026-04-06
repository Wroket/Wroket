import { ValidationError } from "../utils/errors";
import { createProject, addPhase } from "./projectService";
import { createTodo, type Priority, type Effort } from "./todoService";
import { findUserByEmail } from "./authService";
import type { Project } from "./projectService";

export interface CsvRow {
  phase: string;
  task_title: string;
  priority?: string;
  effort?: string;
  deadline?: string;
  start_date?: string;
  assignee_email?: string;
  tags?: string;
}

export interface ParsedTask {
  row: number;
  phase: string;
  title: string;
  priority: Priority;
  effort: Effort;
  deadline: string | null;
  startDate: string | null;
  assigneeEmail: string | null;
  assigneeUid: string | null;
  tags: string[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportPreview {
  projectName: string;
  phases: { name: string; taskCount: number }[];
  tasks: ParsedTask[];
  errors: ImportError[];
}

const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];
const VALID_EFFORTS: Effort[] = ["light", "medium", "heavy"];

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDate(value: string): string | null {
  if (!value) return null;
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // dd/MM/yyyy
  const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) {
    const d = new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return undefined as unknown as null; // signal invalid
}

export function parseCsv(buffer: Buffer): CsvRow[] {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) throw new ValidationError("Le fichier CSV doit contenir un en-tête et au moins une ligne de données");

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const requiredHeaders = ["phase", "task_title"];
  for (const rh of requiredHeaders) {
    if (!headers.includes(rh)) throw new ValidationError(`Colonne obligatoire manquante : ${rh}`);
  }

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = fields[i] ?? ""; });
    return row as unknown as CsvRow;
  });
}

export function validateAndPreview(rows: CsvRow[], projectName: string): ImportPreview {
  const errors: ImportError[] = [];
  const tasks: ParsedTask[] = [];
  const phaseMap = new Map<string, number>();

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-indexed, skip header

    if (!row.phase?.trim()) {
      errors.push({ row: rowNum, field: "phase", message: "Phase obligatoire" });
      return;
    }
    if (!row.task_title?.trim()) {
      errors.push({ row: rowNum, field: "task_title", message: "Titre obligatoire" });
      return;
    }

    const priority = (row.priority?.trim().toLowerCase() || "medium") as Priority;
    if (!VALID_PRIORITIES.includes(priority)) {
      errors.push({ row: rowNum, field: "priority", message: `Valeur invalide : ${row.priority} (attendu: low, medium, high)` });
      return;
    }

    const effort = (row.effort?.trim().toLowerCase() || "medium") as Effort;
    if (!VALID_EFFORTS.includes(effort)) {
      errors.push({ row: rowNum, field: "effort", message: `Valeur invalide : ${row.effort} (attendu: light, medium, heavy)` });
      return;
    }

    let deadline: string | null = null;
    if (row.deadline?.trim()) {
      const parsed = parseDate(row.deadline.trim());
      if (parsed === (undefined as unknown as null)) {
        errors.push({ row: rowNum, field: "deadline", message: `Format de date invalide : ${row.deadline}` });
        return;
      }
      deadline = parsed;
    }

    let startDate: string | null = null;
    if (row.start_date?.trim()) {
      const parsed = parseDate(row.start_date.trim());
      if (parsed === (undefined as unknown as null)) {
        errors.push({ row: rowNum, field: "start_date", message: `Format de date invalide : ${row.start_date}` });
        return;
      }
      startDate = parsed;
    }

    let assigneeEmail: string | null = null;
    let assigneeUid: string | null = null;
    if (row.assignee_email?.trim()) {
      assigneeEmail = row.assignee_email.trim().toLowerCase();
      const user = findUserByEmail(assigneeEmail);
      if (!user) {
        errors.push({ row: rowNum, field: "assignee_email", message: `Utilisateur introuvable : ${assigneeEmail}` });
        return;
      }
      assigneeUid = user.uid;
    }

    const tags = row.tags?.trim()
      ? row.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    const phaseName = row.phase.trim();
    phaseMap.set(phaseName, (phaseMap.get(phaseName) ?? 0) + 1);

    tasks.push({ row: rowNum, phase: phaseName, title: row.task_title.trim(), priority, effort, deadline, startDate, assigneeEmail, assigneeUid, tags });
  });

  const phases = [...phaseMap.entries()].map(([name, taskCount]) => ({ name, taskCount }));

  return { projectName, phases, tasks, errors };
}

export function executeImport(
  uid: string,
  userEmail: string,
  projectName: string,
  teamId: string | null,
  tasks: ParsedTask[],
): { project: Project; taskCount: number } {
  const project = createProject(uid, userEmail, { name: projectName, teamId });

  // Create phases in order of first appearance
  const phaseIdMap = new Map<string, string>();
  const seenPhases: string[] = [];
  for (const task of tasks) {
    if (!seenPhases.includes(task.phase)) seenPhases.push(task.phase);
  }
  for (const phaseName of seenPhases) {
    const phase = addPhase(project.id, { name: phaseName });
    phaseIdMap.set(phaseName, phase.id);
  }

  // Create tasks
  let count = 0;
  for (const task of tasks) {
    createTodo(uid, userEmail, {
      title: task.title,
      priority: task.priority,
      effort: task.effort,
      deadline: task.deadline,
      startDate: task.startDate,
      tags: task.tags,
      projectId: project.id,
      phaseId: phaseIdMap.get(task.phase) ?? null,
      assignedTo: task.assigneeUid,
    });
    count++;
  }

  return { project, taskCount: count };
}
