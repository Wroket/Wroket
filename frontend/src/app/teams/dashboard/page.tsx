"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import { getTeams, getTeamDashboard, Team, TeamDashboardData } from "@/lib/api";
import { displayTodoTitle } from "@/lib/todoDisplay";
import { useLocale } from "@/lib/LocaleContext";

export default function TeamDashboardPage() {
  const { t } = useLocale();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [data, setData] = useState<TeamDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (selectedTeamId) loadDashboard(selectedTeamId);
  }, [selectedTeamId, loadDashboard]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">
            {t("teamDash.title")}
          </h1>
          {teams.length > 1 && (
            <select
              value={selectedTeamId ?? ""}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
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
            {/* Stats cards */}
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

            {/* Member breakdown */}
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
                        <span className="text-zinc-600 dark:text-slate-300 font-medium">{s.total} {t("teamDash.tasks")}</span>
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

            {/* Recent tasks table */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                {t("teamDash.totalTasks")}
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
                          <tr key={todo.id} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                            <td className="px-4 py-3 text-zinc-900 dark:text-slate-100">{displayTodoTitle(todo.title, t("todos.untitled"))}</td>
                            <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs font-mono">
                              {data.memberMap[todo.userId] ?? "—"}
                            </td>
                            <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-500 font-semibold" : "text-zinc-500 dark:text-slate-400"}`}>
                              {todo.deadline ? formatDate(todo.deadline) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                todo.priority === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                todo.priority === "medium" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              }`}>
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
    </AppShell>
  );
}
