/**
 * Sample files aligned with backend parsers:
 * - Tasks: {@link backend/src/services/taskImportService.ts}
 * - New project: {@link backend/src/services/importService.ts} (phase, task_title, …)
 */

/** Standalone task import (dashboard / mes tâches). Header row uses snake_case-friendly names; parser lowercases CSV headers. */
export const TASK_IMPORT_CSV_TEMPLATE = `title,priority,effort,deadline,start_date,tags,estimated_minutes
"Example task",medium,medium,2026-12-31,2026-01-15,"demo,import",30`;

/** Same rows as JSON array (root must be an array). */
export const TASK_IMPORT_JSON_TEMPLATE = `[
  {
    "title": "Example task",
    "priority": "medium",
    "effort": "medium",
    "deadline": "2026-12-31",
    "start_date": "2026-01-15",
    "tags": ["demo", "import"],
    "estimated_minutes": 30
  }
]`;

/** New project + phases + tasks (required columns: phase, task_title). */
export const PROJECT_IMPORT_CSV_TEMPLATE = `phase,task_title,priority,effort,deadline,start_date,assignee_email,tags
Backlog,"Kickoff meeting",high,light,2026-06-01,2026-05-01,,planning
Backlog,"Draft specification",medium,medium,2026-06-15,,,"docs,spec"
Development,"Implement API",high,heavy,,,,backend`;

function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadTaskImportTemplateCsv(): void {
  downloadTextFile("wroket-tasks-template.csv", TASK_IMPORT_CSV_TEMPLATE, "text/csv");
}

export function downloadTaskImportTemplateJson(): void {
  downloadTextFile("wroket-tasks-template.json", TASK_IMPORT_JSON_TEMPLATE, "application/json");
}

export function downloadProjectImportTemplateCsv(): void {
  downloadTextFile("wroket-project-import-template.csv", PROJECT_IMPORT_CSV_TEMPLATE, "text/csv");
}
