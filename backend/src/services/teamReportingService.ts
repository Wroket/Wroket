import type { Todo } from "./todoService";

export type TeamReportingPeriodDays = 7 | 14 | 30;

export interface TeamReportingMemberRow {
  email: string;
  active: number;
  createdInPeriod: number;
  completedInPeriod: number;
  cancelledInPeriod: number;
  overdueActive: number;
}

export interface TeamReportingProjectRow {
  projectId: string;
  active: number;
  createdInPeriod: number;
  completedInPeriod: number;
  cancelledInPeriod: number;
  overdueActive: number;
  noDeadlineActive: number;
  /** Overall completion ratio on this project scope (active + completed, excluding deleted). */
  completionRatio: number | null;
}

export interface TeamReportingVelocityWeek {
  weekStartUtc: string; // ISO date (YYYY-MM-DD)
  weekEndUtc: string;   // ISO date (YYYY-MM-DD)
  completed: number;
  byProject: Record<string, number>;
}

export interface TeamReportingSnapshot {
  periodDays: TeamReportingPeriodDays;
  generatedAt: string; // ISO datetime
  summary: {
    active: number;
    createdInPeriod: number;
    completedInPeriod: number;
    cancelledInPeriod: number;
    overdueActive: number;
    noDeadlineActive: number;
  };
  byMember: TeamReportingMemberRow[];
  byProject: TeamReportingProjectRow[];
  velocityWeeks: TeamReportingVelocityWeek[];
}

function isoUtcDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfUtcWeek(d: Date): Date {
  // Monday 00:00 UTC
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const day = x.getUTCDay(); // 0=Sun .. 6=Sat
  const delta = (day + 6) % 7; // Mon->0, Tue->1, ..., Sun->6
  x.setUTCDate(x.getUTCDate() - delta);
  return x;
}

function safeTimeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function computeTeamReportingSnapshot(args: {
  todos: Todo[];
  projectIdSet: Set<string>;
  memberEmailByUid: Record<string, string>;
  periodDays: TeamReportingPeriodDays;
  now?: Date;
}): TeamReportingSnapshot {
  const now = args.now ?? new Date();
  const nowMs = now.getTime();
  const cutoffMs = nowMs - args.periodDays * 24 * 60 * 60 * 1000;

  const memberRowsByEmail = new Map<string, TeamReportingMemberRow>();
  const projectRowsById = new Map<string, Omit<TeamReportingProjectRow, "completionRatio"> & { completedTotal: number }>();

  let active = 0;
  let createdInPeriod = 0;
  let completedInPeriod = 0;
  let cancelledInPeriod = 0;
  let overdueActive = 0;
  let noDeadlineActive = 0;

  function getMemberRow(email: string): TeamReportingMemberRow {
    const existing = memberRowsByEmail.get(email);
    if (existing) return existing;
    const row: TeamReportingMemberRow = {
      email,
      active: 0,
      createdInPeriod: 0,
      completedInPeriod: 0,
      cancelledInPeriod: 0,
      overdueActive: 0,
    };
    memberRowsByEmail.set(email, row);
    return row;
  }

  function getProjectRow(projectId: string) {
    const existing = projectRowsById.get(projectId);
    if (existing) return existing;
    const row = {
      projectId,
      active: 0,
      createdInPeriod: 0,
      completedInPeriod: 0,
      cancelledInPeriod: 0,
      overdueActive: 0,
      noDeadlineActive: 0,
      completedTotal: 0,
    };
    projectRowsById.set(projectId, row);
    return row;
  }

  for (const todo of args.todos) {
    if (todo.status === "deleted") continue;
    if (!todo.projectId || !args.projectIdSet.has(todo.projectId)) continue;

    const ownerEmail = args.memberEmailByUid[todo.userId] ?? todo.userId;
    const m = getMemberRow(ownerEmail);
    const p = getProjectRow(todo.projectId);

    const createdMs = safeTimeMs(todo.createdAt);
    if (createdMs !== null && createdMs >= cutoffMs) {
      createdInPeriod++;
      m.createdInPeriod++;
      p.createdInPeriod++;
    }

    const statusChangedMs = safeTimeMs(todo.statusChangedAt);
    if (todo.status === "completed") {
      p.completedTotal++;
      if (statusChangedMs !== null && statusChangedMs >= cutoffMs) {
        completedInPeriod++;
        m.completedInPeriod++;
        p.completedInPeriod++;
      }
    } else if (todo.status === "cancelled") {
      if (statusChangedMs !== null && statusChangedMs >= cutoffMs) {
        cancelledInPeriod++;
        m.cancelledInPeriod++;
        p.cancelledInPeriod++;
      }
    } else if (todo.status === "active") {
      active++;
      m.active++;
      p.active++;

      if (!todo.deadline) {
        noDeadlineActive++;
        p.noDeadlineActive++;
      } else {
        const dlMs = safeTimeMs(todo.deadline);
        if (dlMs !== null && dlMs < nowMs) {
          overdueActive++;
          m.overdueActive++;
          p.overdueActive++;
        }
      }
    }
  }

  const velocityWeeks: TeamReportingVelocityWeek[] = [];
  const week0 = startOfUtcWeek(now);
  for (let i = 3; i >= 0; i--) {
    const start = new Date(week0);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const startMs = start.getTime();
    const endMs = end.getTime();

    const byProject: Record<string, number> = {};
    let completed = 0;
    for (const todo of args.todos) {
      if (todo.status !== "completed") continue;
      if (!todo.projectId || !args.projectIdSet.has(todo.projectId)) continue;
      const t = safeTimeMs(todo.statusChangedAt);
      if (t === null || t < startMs || t >= endMs) continue;
      completed++;
      byProject[todo.projectId] = (byProject[todo.projectId] ?? 0) + 1;
    }

    velocityWeeks.push({
      weekStartUtc: isoUtcDate(start),
      weekEndUtc: isoUtcDate(end),
      completed,
      byProject,
    });
  }

  const byMember = Array.from(memberRowsByEmail.values()).sort((a, b) => a.email.localeCompare(b.email));
  const byProject = Array.from(projectRowsById.values())
    .map((row) => {
      const denom = row.active + row.completedTotal;
      const completionRatio = denom > 0 ? row.completedTotal / denom : null;
      const { completedTotal, ...rest } = row;
      return { ...rest, completionRatio };
    })
    .sort((a, b) => b.overdueActive - a.overdueActive || b.active - a.active || a.projectId.localeCompare(b.projectId));

  return {
    periodDays: args.periodDays,
    generatedAt: now.toISOString(),
    summary: {
      active,
      createdInPeriod,
      completedInPeriod,
      cancelledInPeriod,
      overdueActive,
      noDeadlineActive,
    },
    byMember,
    byProject,
    velocityWeeks,
  };
}

