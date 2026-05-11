"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import TaskEditModal from "@/components/TaskEditModal";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import {
  getTeams,
  getTeamDashboard,
  getTeamReporting,
  getTeamCollaborators,
  addTeamCollaboratorApi,
  removeTeamCollaboratorApi,
  getProjects,
  getCommentCounts,
  updateTodo,
  lookupUser,
  type Team,
  type TeamCollaborator,
  type TeamDashboardData,
  type Todo,
  type Project,
  type AuthMeResponse,
  type TeamReportingPeriodDays,
  type TeamReportingResponse,
  type Priority,
  type Effort,
  type Recurrence,
} from "@/lib/api";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { useLocale } from "@/lib/LocaleContext";
import { useUserLookup } from "@/lib/userUtils";
import { useTaskEditAutoSave } from "@/lib/useTaskEditAutoSave";

function canEditTeamTask(todo: Todo, meUid: string | null | undefined): boolean {
  return !!meUid && (todo.userId === meUid || todo.assignedTo === meUid);
}

export default function TeamDashboardPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const meUid = user?.uid ?? null;
  const { resolveUser, displayName: userDisplayName } = useUserLookup();

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [data, setData] = useState<TeamDashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [reportingPeriodDays, setReportingPeriodDays] = useState<TeamReportingPeriodDays>(7);
  const [reporting, setReporting] = useState<TeamReportingResponse | null>(null);
  const [reportingLoading, setReportingLoading] = useState(false);
  const canTeamReporting = user?.entitlements?.teamReporting === true;

  const [extCollaborators, setExtCollaborators] = useState<TeamCollaborator[]>([]);
  const [newCollabEmail, setNewCollabEmail] = useState("");
  const [collabSubmitting, setCollabSubmitting] = useState(false);

  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    priority: "medium" as Priority,
    effort: "medium" as Effort,
    startDate: "",
    deadline: "",
    assignedTo: "" as string | null,
    estimatedMinutes: null as number | null,
    tags: [] as string[],
    recurrence: null as Recurrence | null,
    projectId: null as string | null,
  });
  const [editAssignEmail, setEditAssignEmail] = useState("");
  const [editAssignedUser, setEditAssignedUser] = useState<AuthMeResponse | null>(null);
  const [editAssignError, setEditAssignError] = useState<string | null>(null);
  const editAssignLookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    getProjects()
      .then((list) => setProjects(list.filter((p) => p.status === "active")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getTeams()
      .then((list) => {
        setTeams(list);
        if (list.length > 0) setSelectedTeamId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestIdRef = useRef(0);
  const reportingRequestIdRef = useRef(0);

  const loadDashboard = useCallback(async (teamId: string) => {
    const reqId = ++requestIdRef.current;
    setData(null);
    try {
      const d = await getTeamDashboard(teamId);
      if (reqId === requestIdRef.current) setData(d);
    } catch {
      if (reqId === requestIdRef.current) setData(null);
    }
  }, []);

  const loadReporting = useCallback(async (teamId: string, periodDays: TeamReportingPeriodDays) => {
    const reqId = ++reportingRequestIdRef.current;
    setReportingLoading(true);
    try {
      const r = await getTeamReporting(teamId, periodDays);
      if (reqId === reportingRequestIdRef.current) setReporting(r);
    } catch {
      if (reqId === reportingRequestIdRef.current) setReporting(null);
    } finally {
      if (reqId === reportingRequestIdRef.current) setReportingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    const id = selectedTeamId;
    void Promise.resolve().then(() => {
      void loadDashboard(id);
    });
    getTeamCollaborators(id)
      .then(setExtCollaborators)
      .catch(() => setExtCollaborators([]));
  }, [selectedTeamId, loadDashboard]);

  useEffect(() => {
    if (!selectedTeamId || !canTeamReporting) {
      setReporting(null);
      setReportingLoading(false);
      return;
    }
    const id = selectedTeamId;
    void Promise.resolve().then(() => {
      void loadReporting(id, reportingPeriodDays);
    });
  }, [selectedTeamId, reportingPeriodDays, loadReporting, canTeamReporting]);

  useEffect(() => {
    return () => {
      if (editAssignLookupTimer.current) clearTimeout(editAssignLookupTimer.current);
    };
  }, []);

  const replaceTodoInData = useCallback((updated: Todo) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, todos: prev.todos.map((x) => (x.id === updated.id ? updated : x)) };
    });
  }, []);

  const onEditAutoSaved = useCallback(
    (updated: Todo) => {
      replaceTodoInData(updated);
      setEditingTodo(updated);
    },
    [replaceTodoInData],
  );

  const viewOnly = !!(editingTodo && !canEditTeamTask(editingTodo, meUid));

  const { saving: editAutoSaving, syncBaseline, flush } = useTaskEditAutoSave({
    editingTodo,
    editForm,
    onSaved: onEditAutoSaved,
    onError: (msg) => toast.error(msg),
    enabled: !!editingTodo && canEditTeamTask(editingTodo, meUid),
  });

  const handleEditAssignLookup = (email: string) => {
    setEditAssignEmail(email);
    setEditAssignError(null);
    clearTimeout(editAssignLookupTimer.current);
    if (!email.includes("@") || email.length < 5) {
      setEditAssignedUser(null);
      return;
    }
    editAssignLookupTimer.current = setTimeout(async () => {
      try {
        const u = await lookupUser(email);
        if (u) {
          setEditAssignedUser(u);
          setEditAssignError(null);
          setEditForm((f) => ({ ...f, assignedTo: u.uid }));
        } else {
          setEditAssignedUser(null);
          setEditAssignError(t("assign.userNotFound"));
        }
      } catch {
        setEditAssignedUser(null);
      }
    }, 300);
  };

  const openTaskEdit = useCallback(
    (todo: Todo) => {
      const latest = data?.todos.find((x) => x.id === todo.id) ?? todo;
      setEditingTodo(latest);
      setEditForm({
        title: latest.title,
        priority: latest.priority,
        effort: latest.effort ?? "medium",
        startDate: latest.startDate ?? "",
        deadline: latest.deadline ?? "",
        assignedTo: latest.assignedTo ?? null,
        estimatedMinutes: latest.estimatedMinutes ?? null,
        tags: latest.tags ?? [],
        recurrence: latest.recurrence ?? null,
        projectId: latest.projectId ?? null,
      });
      setEditAssignEmail("");
      setEditAssignedUser(null);
      setEditAssignError(null);
      if (latest.assignedTo) resolveUser(latest.assignedTo);
    },
    [data, resolveUser],
  );

  const closeEditModal = useCallback(async () => {
    await flush();
    setEditingTodo(null);
    if (selectedTeamId) void loadDashboard(selectedTeamId);
  }, [flush, loadDashboard, selectedTeamId]);

  const persistEditTags = useCallback(
    async (tags: string[]) => {
      if (!editingTodo || viewOnly) return;
      const updated = await updateTodo(editingTodo.id, { tags });
      setEditForm((f) => ({ ...f, tags: updated.tags ?? tags }));
      setEditingTodo(updated);
      replaceTodoInData(updated);
      syncBaseline();
    },
    [editingTodo, viewOnly, replaceTodoInData, syncBaseline],
  );

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const escapeCsv = (value: string | number | null | undefined): string => {
    const raw = value === null || value === undefined ? "" : String(value);
    const needsQuotes = /[,"\n\r]/.test(raw);
    const escaped = raw.replaceAll('"', '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const downloadCsv = (filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) => {
    const lines = [header.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const subtaskCount =
    editingTodo && data ? data.todos.filter((x) => x.parentId === editingTodo.id).length : 0;

  const canManageCurrentTeam = data
    ? data.team.ownerUid === user?.uid ||
      data.team.members.some((m) => m.email === user?.email && (m.role === "co-owner" || m.role === "admin"))
    : false;

  const usedSeats = data ? 1 + data.team.members.length : 0;
  const totalSeats = data?.team.seatCount;

  const handleAddExtCollab = async () => {
    if (!selectedTeamId || !newCollabEmail.trim()) return;
    setCollabSubmitting(true);
    try {
      const entry = await addTeamCollaboratorApi(selectedTeamId, newCollabEmail.trim());
      setExtCollaborators((prev) => {
        const exists = prev.some((c) => c.email === entry.email);
        return exists ? prev : [...prev, entry];
      });
      setNewCollabEmail("");
      toast.success(`${entry.email} invité comme collaborateur`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setCollabSubmitting(false);
    }
  };

  const handleRemoveExtCollab = async (email: string) => {
    if (!selectedTeamId) return;
    try {
      await removeTeamCollaboratorApi(selectedTeamId, email);
      setExtCollaborators((prev) => prev.filter((c) => c.email !== email));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">
            {t("teamDash.title")}
          </h1>
          {teams.length > 0 && (
            <select
              value={selectedTeamId ?? ""}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              aria-label={t("teamDash.select")}
              className="min-w-[12rem] rounded-lg border-2 border-indigo-300 dark:border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 px-3 py-2.5 text-sm font-semibold text-indigo-950 dark:text-indigo-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-500"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-sm text-zinc-400 dark:text-slate-500 text-center py-10">
            {teams.length === 0 ? t("teams.teamsEmpty") : t("teamDash.noTasks")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
                <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{t("teamDash.totalTasks")}</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-slate-100 mt-1">{data.stats.totalTasks}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
                <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{t("teamDash.overdue")}</p>
                <p className={`text-2xl font-bold mt-1 ${data.stats.overdue > 0 ? "text-red-500" : "text-zinc-900 dark:text-slate-100"}`}>{data.stats.overdue}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
                <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{t("teamDash.dueSoon")}</p>
                <p className={`text-2xl font-bold mt-1 ${data.stats.dueSoon > 0 ? "text-amber-500" : "text-zinc-900 dark:text-slate-100"}`}>{data.stats.dueSoon}</p>
              </div>
            </div>

            {/* Sièges */}
            {(data.team.billingPlan === "small" || data.team.billingPlan === "large") && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 px-4 py-3">
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm shrink-0">
                  Plan {data.team.billingPlan === "small" ? "Small teams" : "Large teams"}
                </span>
                {totalSeats !== undefined && (
                  <>
                    <span className="text-zinc-400 dark:text-slate-500 text-xs">—</span>
                    <span className="text-sm text-zinc-700 dark:text-slate-200">
                      <span className={usedSeats >= totalSeats ? "text-red-500 font-bold" : "font-semibold"}>
                        {usedSeats}
                      </span>
                      <span className="text-zinc-400 dark:text-slate-500"> / {totalSeats} sièges</span>
                    </span>
                    {usedSeats >= totalSeats && (
                      <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">
                        Quota atteint
                      </span>
                    )}
                  </>
                )}
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {t("teamDash.memberBreakdown")}
              </h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden">
                <div className="divide-y divide-zinc-100 dark:divide-slate-800">
                  {Object.entries(data.stats.byMember).map(([email, s]) => (
                    <div key={email} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase shrink-0">
                        {email[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{email}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs">
                        <span className="text-zinc-600 dark:text-slate-300 font-medium">
                          {s.total} {t("teamDash.tasks")}
                        </span>
                        {s.overdue > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-semibold">
                            {s.overdue} {t("teamDash.overdue").toLowerCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide">
                  {t("teamReport.title")}
                </h2>
                {canTeamReporting && (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="team-reporting-period">
                    {t("teamReport.periodLabel")}
                  </label>
                  <select
                    id="team-reporting-period"
                    value={reportingPeriodDays}
                    onChange={(e) => setReportingPeriodDays(Number(e.target.value) as TeamReportingPeriodDays)}
                    className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-sm text-zinc-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value={7}>{t("teamReport.period7")}</option>
                    <option value={14}>{t("teamReport.period14")}</option>
                    <option value={30}>{t("teamReport.period30")}</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!reporting) return;
                      const rows = reporting.byProject.map((p) => [
                        projectNameById.get(p.projectId) ?? p.projectId,
                        p.active,
                        p.createdInPeriod,
                        p.completedInPeriod,
                        p.overdueActive,
                        p.noDeadlineActive,
                        p.cancelledInPeriod,
                        p.completionRatio === null ? "" : Math.round(p.completionRatio * 100),
                      ]);
                      downloadCsv(
                        `wroket-team-reporting-projects-${reporting.periodDays}d.csv`,
                        [
                          t("teamReport.csv.project"),
                          t("teamReport.csv.active"),
                          t("teamReport.csv.createdInPeriod"),
                          t("teamReport.csv.completedInPeriod"),
                          t("teamReport.csv.overdueActive"),
                          t("teamReport.csv.noDeadlineActive"),
                          t("teamReport.csv.cancelledInPeriod"),
                          t("teamReport.csv.completionPct"),
                        ],
                        rows,
                      );
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  >
                    {t("teamReport.exportCsv")}
                  </button>
                </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4 space-y-4">
                {!canTeamReporting ? (
                  <p className="text-sm text-zinc-600 dark:text-slate-400">{t("teamReport.lockedLarge")}</p>
                ) : reportingLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-slate-400">
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span>{t("teamReport.loading")}</span>
                  </div>
                ) : !reporting ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500">{t("teamReport.unavailable")}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-zinc-200 dark:border-slate-700 p-3">
                        <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{t("teamReport.activeNow")}</p>
                        <p className="text-xl font-bold text-zinc-900 dark:text-slate-100 mt-1">{reporting.summary.active}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 dark:border-slate-700 p-3">
                        <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{t("teamReport.completedInPeriod")}</p>
                        <p className="text-xl font-bold text-zinc-900 dark:text-slate-100 mt-1">{reporting.summary.completedInPeriod}</p>
                      </div>
                      <div className="rounded-xl border border-zinc-200 dark:border-slate-700 p-3">
                        <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{t("teamReport.overdueActive")}</p>
                        <p className={`text-xl font-bold mt-1 ${reporting.summary.overdueActive > 0 ? "text-red-500" : "text-zinc-900 dark:text-slate-100"}`}>
                          {reporting.summary.overdueActive}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                            <th className="text-left px-3 py-2 font-medium text-zinc-500 dark:text-slate-400">{t("teamReport.table.project")}</th>
                            <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-slate-400">{t("teamReport.table.active")}</th>
                            <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-slate-400">{t("teamReport.table.completed")}</th>
                            <th className="text-right px-3 py-2 font-medium text-zinc-500 dark:text-slate-400">{t("teamReport.table.overdue")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reporting.byProject.map((p) => (
                            <tr key={p.projectId} className="border-b border-zinc-100 dark:border-slate-800">
                              <td className="px-3 py-2 text-zinc-900 dark:text-slate-100">
                                {projectNameById.get(p.projectId) ?? p.projectId}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-600 dark:text-slate-300">{p.active}</td>
                              <td className="px-3 py-2 text-right text-zinc-600 dark:text-slate-300">{p.completedInPeriod}</td>
                              <td className={`px-3 py-2 text-right ${p.overdueActive > 0 ? "text-red-500 font-semibold" : "text-zinc-600 dark:text-slate-300"}`}>
                                {p.overdueActive}
                              </td>
                            </tr>
                          ))}
                          {reporting.byProject.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-zinc-400 dark:text-slate-500">
                                {t("teamReport.empty")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Collaborateurs externes */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Collaborateurs externes
              </h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden">
                {extCollaborators.length > 0 && (
                  <div className="divide-y divide-zinc-100 dark:divide-slate-800">
                    {extCollaborators.map((c) => (
                      <div key={c.email} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-zinc-500 uppercase shrink-0">
                          {c.email[0]}
                        </div>
                        <span className="flex-1 text-sm text-zinc-800 dark:text-slate-100 truncate">{c.email}</span>
                        {c.status === "pending" && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            En attente
                          </span>
                        )}
                        {canManageCurrentTeam && (
                          <button
                            type="button"
                            onClick={() => handleRemoveExtCollab(c.email)}
                            className="ml-1 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
                            aria-label={`Retirer ${c.email}`}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {extCollaborators.length === 0 && (
                  <p className="px-4 py-4 text-sm text-zinc-400 dark:text-slate-500">
                    Aucun collaborateur externe. Invitez des personnes extérieures à l'équipe qui garderont leur propre plan.
                  </p>
                )}
                {canManageCurrentTeam && (
                  <div className="border-t border-zinc-100 dark:border-slate-800 px-4 py-3 flex items-center gap-2">
                    <input
                      type="email"
                      value={newCollabEmail}
                      onChange={(e) => setNewCollabEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleAddExtCollab(); }}
                      placeholder="email@exemple.com"
                      className="flex-1 min-w-0 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddExtCollab()}
                      disabled={collabSubmitting || !newCollabEmail.trim()}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-2 text-sm font-medium transition-colors"
                    >
                      Inviter
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {t("teamDash.sharedNotes")}
              </h2>
              <Link
                href="/notes"
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-slate-800/80 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0" aria-hidden>
                    📝
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-slate-100">{t("teamDash.sharedNotes")}</p>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 truncate">{t("teamDash.sharedNotesHint")}</p>
                  </div>
                </div>
                <svg className="w-5 h-5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {t("teamDash.teamProjectTasks")}
              </h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                        <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("todos.titleLabel")}</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("assign.label")}</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("todos.deadlineLabel")}</th>
                        <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("edit.priority")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todos.slice(0, 50).map((todo) => {
                        const isOverdue = todo.deadline && new Date(todo.deadline) < new Date();
                        return (
                          <tr key={todo.id} className="border-b border-zinc-100 dark:border-slate-800">
                            <td className="px-0 py-0 text-zinc-900 dark:text-slate-100">
                              <button
                                type="button"
                                onClick={() => openTaskEdit(todo)}
                                className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-slate-800/30 transition-colors"
                              >
                                {displayTodoTitle(todo.title, t("todos.untitled"))}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs align-top">
                              {data.memberMap[todo.userId] ?? "—"}
                            </td>
                            <td className={`px-4 py-3 text-xs align-top ${isOverdue ? "text-red-500 font-semibold" : "text-zinc-500 dark:text-slate-400"}`}>
                              {todo.deadline ? formatDate(todo.deadline) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center align-top">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                  todo.priority === "high"
                                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                    : todo.priority === "medium"
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                }`}
                              >
                                {t(`priority.${todo.priority}`)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {data.todos.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">
                            {t("teamDash.noTasks")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <TaskEditModal
        todo={editingTodo}
        form={editForm}
        onFormChange={(updates) => setEditForm((f) => ({ ...f, ...updates }))}
        onClose={closeEditModal}
        saving={editAutoSaving}
        assignEmail={editAssignEmail}
        onAssignEmailChange={handleEditAssignLookup}
        assignedUser={editAssignedUser}
        assignError={editAssignError}
        onAssignLookup={() => handleEditAssignLookup(editAssignEmail)}
        onClearAssign={() => setEditForm((f) => ({ ...f, assignedTo: null }))}
        userDisplayName={userDisplayName}
        subtaskCount={subtaskCount}
        effortDefaults={user?.effortMinutes}
        currentUserUid={user?.uid}
        projects={projects}
        isTaskOwner={!editingTodo || editingTodo.userId === user?.uid}
        viewOnly={viewOnly}
        onSuggestedSlotChange={
          editingTodo && editingTodo.userId === user?.uid && editingTodo.assignedTo && !viewOnly
            ? async (slot) => {
                try {
                  const updated = await updateTodo(editingTodo.id, { suggestedSlot: slot });
                  replaceTodoInData(updated);
                  setEditingTodo(updated);
                } catch {
                  toast.error(t("toast.updateError"));
                }
              }
            : undefined
        }
        onPersistTags={viewOnly ? undefined : persistEditTags}
        onTodoCommentsChanged={() => {
          getCommentCounts().catch(() => {});
        }}
      />
    </AppShell>
  );
}
