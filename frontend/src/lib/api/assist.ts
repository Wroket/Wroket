import { API_BASE_URL, apiFetchDefaults, parseJsonOrThrow, extractApiMessage } from "./core";

export type AssistDigestTodo = {
  id: string;
  title: string;
  overdue: boolean;
  deadline: string | null;
  scheduledStart: string | null;
  priority: string;
  projectId: string | null;
};

export type AssistCommitteePreview = {
  command: "committee";
  projectId: string;
  projectName: string;
  steering: { health: string; overdueCount: number; completionRatio: number | null };
  overdueTasks: AssistDigestTodo[];
  blockedTasks: { id: string; title: string; blockers: { id: string; title: string }[] }[];
  activeShareLinks: { id: string; token: string; publicUrl: string; expiresAt: string | null }[];
  canCreateShareLink: boolean;
  summaryMarkdown: string;
};

export type AssistPlanWeekSuggestion = {
  todoId: string;
  title: string;
  proposedStart: string;
  proposedEnd: string;
  label: string;
};

export type AssistPlanWeekPreview = {
  command: "plan-week";
  focus: AssistDigestTodo[];
  suggestions: AssistPlanWeekSuggestion[];
  unscheduledWithoutSlot: { todoId: string; title: string; reason: string }[];
  summaryMarkdown: string;
};

export type AssistRisksPreview = {
  command: "risks";
  hasTeams: boolean;
  projects: { name: string; health: string; overdueCount: number; projectId: string }[];
  overdueTasks: AssistDigestTodo[];
  summaryMarkdown: string;
};

export type AssistPlanWeekApplyResult = {
  booked: { todoId: string; start: string; end: string }[];
  conflicts: {
    todoId: string;
    code: string;
    conflicts?: { id: string; title: string; start: string; end: string }[];
  }[];
  errors: { todoId: string; message: string }[];
};

async function assistGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { ...apiFetchDefaults, method: "GET" });
  const body = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(extractApiMessage(body, `Erreur (${res.status})`));
  return body as T;
}

async function assistPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await parseJsonOrThrow(res);
  if (!res.ok) throw new Error(extractApiMessage(json, `Erreur (${res.status})`));
  return json as T;
}

export function previewAssistCommittee(projectId: string): Promise<AssistCommitteePreview> {
  return assistGet(`/assist/committee?projectId=${encodeURIComponent(projectId)}`);
}

export function applyAssistCommitteeShare(projectId: string): Promise<{ publicUrl: string }> {
  return assistPost("/assist/committee/apply", { projectId });
}

export function previewAssistPlanWeek(): Promise<AssistPlanWeekPreview> {
  return assistGet("/assist/plan-week");
}

export function applyAssistPlanWeekBooks(
  bookings: { todoId: string; start: string; end: string }[],
  force = false,
): Promise<AssistPlanWeekApplyResult> {
  return assistPost("/assist/plan-week/apply", { bookings, force });
}

export function previewAssistRisks(): Promise<AssistRisksPreview> {
  return assistGet("/assist/risks");
}
