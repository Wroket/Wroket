"use client";

import { useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import { getAdminStats, getAdminUsers, AdminStats, AdminUser } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
      <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-slate-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const { t } = useLocale();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u); })
      .catch(() => setDenied(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <span className="text-zinc-400 dark:text-slate-500 text-sm">{t("loading")}</span>
        </div>
      </AppShell>
    );
  }

  if (denied) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <p className="text-red-500 dark:text-red-400 font-medium">{t("admin.accessDenied")}</p>
        </div>
      </AppShell>
    );
  }

  const formatDate = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("admin.title")}</h1>

        {stats && (
          <>
            {/* Users stats */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.users")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard label={t("admin.usersTotal")} value={stats.users.total} />
                <StatCard label={t("admin.usersVerified")} value={stats.users.verified} sub={`${stats.users.total ? Math.round(stats.users.verified / stats.users.total * 100) : 0}%`} />
                <StatCard label={t("admin.users7d")} value={stats.users.last7d} />
                <StatCard label={t("admin.users30d")} value={stats.users.last30d} />
                <StatCard label={t("admin.usersGoogle")} value={stats.users.googleSso} />
              </div>
            </div>

            {/* Tasks stats */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.tasks")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label={t("admin.usersTotal")} value={stats.tasks.total} />
                <StatCard label={t("admin.tasksActive")} value={stats.tasks.active} />
                <StatCard label={t("admin.tasksCompleted")} value={stats.tasks.completed} />
                <StatCard label={t("admin.tasksCancelled")} value={stats.tasks.cancelled} />
              </div>
            </div>

            {/* Projects, Teams, Invites */}
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label={t("admin.projects")} value={stats.projects.total} sub={`${stats.projects.active} ${t("admin.projectsActive").toLowerCase()}`} />
                <StatCard label={t("admin.teams")} value={stats.teams} />
                <StatCard label={t("admin.invites")} value={stats.invitesSent} />
              </div>
            </div>
          </>
        )}

        {/* User list */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.userList")}</h2>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.email")}</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.name")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.verified")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.method")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.taskCount")}</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.joined")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.uid} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-slate-300">
                        {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.emailVerified
                          ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Vérifié" />
                          : <span className="inline-block w-2 h-2 rounded-full bg-zinc-300 dark:bg-slate-600" title="Non vérifié" />}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {u.googleSso
                          ? <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">Google</span>
                          : <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-slate-800 text-zinc-600 dark:text-slate-400 border border-zinc-200 dark:border-slate-700">Email</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{u.taskCount}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">Aucun utilisateur</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
