"use client";

import { useCallback, useEffect, useState } from "react";

import AppShell from "@/components/AppShell";
import {
  getAdminStats, getAdminUsers, getAdminInvites,
  getAdminActivity, getAdminSessions, getAdminIntegrations,
  getAdminUserExport, deleteAdminUser, getAdminCompletionRates,
  AdminStats, AdminUser, InviteLogEntry,
  ActivityLogEntry, SessionInfo, IntegrationOverview, CompletionRate,
} from "@/lib/api";
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

type Tab = "stats" | "users" | "activity" | "sessions" | "integrations" | "rgpd";

const TABS: Tab[] = ["stats", "users", "activity", "sessions", "integrations", "rgpd"];

export default function AdminPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<InviteLogEntry[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationOverview | null>(null);
  const [completionRates, setCompletionRates] = useState<CompletionRate[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmUid, setDeleteConfirmUid] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminUsers(), getAdminInvites()])
      .then(([s, u, i]) => { setStats(s); setUsers(u); setInvites(i); })
      .catch(() => setDenied(true))
      .finally(() => setLoading(false));
  }, []);

  const loadActivity = useCallback(() => {
    getAdminActivity({ limit: 100 }).then((r) => { setActivity(r.entries); setActivityTotal(r.total); }).catch(() => {});
  }, []);

  const loadSessions = useCallback(() => {
    getAdminSessions().then(setSessions).catch(() => {});
  }, []);

  const loadIntegrations = useCallback(() => {
    getAdminIntegrations().then(setIntegrations).catch(() => {});
  }, []);

  const loadCompletionRates = useCallback(() => {
    getAdminCompletionRates().then(setCompletionRates).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "activity" && activity.length === 0) loadActivity();
    if (tab === "sessions" && sessions.length === 0) loadSessions();
    if (tab === "integrations" && !integrations) loadIntegrations();
    if (tab === "users") loadCompletionRates();
  }, [tab, activity.length, sessions.length, integrations, loadActivity, loadSessions, loadIntegrations, loadCompletionRates]);

  const handleExportUser = async (uid: string) => {
    try {
      const data = await getAdminUserExport(uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wroket-export-${uid}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleDeleteUser = async (uid: string) => {
    try {
      await deleteAdminUser(uid);
      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      setDeleteConfirmUid(null);
    } catch { /* ignore */ }
  };

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

  const formatDateTime = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const rateForUser = (uid: string) => completionRates.find((r) => r.uid === uid);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}j ${h}h`;
    if (h > 0) return `${h}h ${m}min`;
    return `${m}min`;
  };

  const RGPD_REGISTRY = [
    { data: "Email, prénom, nom", purpose: "Authentification & profil", retention: "Durée du compte" },
    { data: "Tâches, projets, commentaires", purpose: "Fonctionnalités applicatives", retention: "Durée du compte" },
    { data: "Notifications", purpose: "Alertes et rappels", retention: "100 dernières par utilisateur" },
    { data: "Sessions (token, expiration)", purpose: "Maintien de connexion", retention: "30 jours" },
    { data: "Journal d'activité", purpose: "Audit et traçabilité", retention: "10 000 dernières entrées" },
    { data: "Webhooks (URLs)", purpose: "Intégrations tierces", retention: "Durée du compte" },
    { data: "Google Calendar tokens", purpose: "Synchronisation agenda", retention: "Jusqu'à déconnexion" },
  ];

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("admin.title")}</h1>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-slate-700 pb-px">
          {TABS.map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === tb
                  ? "bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 border border-b-0 border-zinc-200 dark:border-slate-700 -mb-px"
                  : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200"
              }`}
            >
              {t(`admin.tabs.${tb}`)}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {tab === "stats" && stats && (
          <>
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
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.tasks")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatCard label={t("admin.usersTotal")} value={stats.tasks.total} />
                <StatCard label={t("admin.tasksActive")} value={stats.tasks.active} />
                <StatCard label={t("admin.tasksCompleted")} value={stats.tasks.completed} />
                <StatCard label={t("admin.tasksCancelled")} value={stats.tasks.cancelled} />
                <StatCard label={t("admin.tasksScheduled")} value={stats.tasks.scheduled} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard label={t("admin.projects")} value={stats.projects.total} sub={`${stats.projects.active} ${t("admin.projectsActive").toLowerCase()}`} />
              <StatCard label={t("admin.teams")} value={stats.teams} />
              <StatCard label={t("admin.invites")} value={stats.invitesSent} />
              <StatCard label={t("admin.notes")} value={stats.notes} />
              <StatCard label={t("admin.comments")} value={stats.comments} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={t("admin.uptime")} value={formatUptime(stats.uptime)} />
            </div>

            {/* Invite log */}
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.inviteLog")}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteFrom")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteTo")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteDate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv, i) => (
                      <tr key={`${inv.sentAt}-${i}`} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{inv.fromEmail}</td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{inv.toEmail}</td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{formatDate(inv.sentAt)}</td>
                      </tr>
                    ))}
                    {invites.length === 0 && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">{t("admin.noInvites")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.email")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.name")}</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.verified")}</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.taskCount")}</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.notes")}</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.completionRate")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.joined")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.lastLogin")}</th>
                  <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">RGPD</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const rate = rateForUser(u.uid);
                  return (
                    <tr key={u.uid} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{u.email}</td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-slate-300">{u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        {u.emailVerified
                          ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title={t("admin.verifiedTooltip")} />
                          : <span className="inline-block w-2 h-2 rounded-full bg-zinc-300 dark:bg-slate-600" title={t("admin.unverifiedTooltip")} />}
                      </td>
                      <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{u.taskCount}</td>
                      <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{u.noteCount ?? 0}</td>
                      <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{rate ? `${rate.rate}%` : "—"}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => handleExportUser(u.uid)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline" title={t("admin.rgpd.export")}>
                            {t("admin.exportShort")}
                          </button>
                          {deleteConfirmUid === u.uid ? (
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => handleDeleteUser(u.uid)} className="text-xs text-red-600 font-medium">Oui</button>
                              <button type="button" onClick={() => setDeleteConfirmUid(null)} className="text-xs text-zinc-500">Non</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => setDeleteConfirmUid(u.uid)} className="text-xs text-red-500 hover:underline" title={t("admin.rgpd.delete")}>
                              Suppr.
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Activity tab */}
        {tab === "activity" && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
            <div className="px-4 py-2 text-xs text-zinc-400 dark:text-slate-500 border-b border-zinc-200 dark:border-slate-700">
              {activityTotal} {t("admin.activity.action").toLowerCase()}(s)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.activity.date")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.activity.user")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.activity.action")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.activity.entity")}</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{a.userEmail}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.action === "create" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" :
                        a.action === "update" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                        a.action === "delete" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                        "bg-zinc-100 dark:bg-slate-800 text-zinc-600 dark:text-slate-400"
                      }`}>{a.action}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-slate-300 text-xs">
                      {a.entityType} <span className="text-zinc-400 dark:text-slate-500">{a.details && (a.details as Record<string, unknown>).title ? `— ${(a.details as Record<string, unknown>).title}` : ""}</span>
                    </td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">{t("admin.activity.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Sessions tab */}
        {tab === "sessions" && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.sessions.email")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">Expire</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={`${s.uid}-${i}`} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{s.email}</td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{new Date(s.expiresAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">{t("admin.sessions.empty")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Integrations tab */}
        {tab === "integrations" && integrations && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={t("admin.integrations.webhooks")} value={integrations.webhooks.total} sub={`${integrations.webhooks.active} actifs`} />
              <StatCard label={t("admin.integrations.google")} value={integrations.googleCalendarConnected} />
            </div>
            {Object.keys(integrations.webhooks.byPlatform).length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
                <h3 className="text-xs font-medium text-zinc-500 dark:text-slate-400 uppercase mb-2">Par plateforme</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(integrations.webhooks.byPlatform).map(([platform, count]) => (
                    <span key={platform} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-xs px-3 py-1">
                      {platform} <span className="font-bold">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* RGPD tab */}
        {tab === "rgpd" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.rgpd.registry")}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.rgpd.registryData")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.rgpd.registryPurpose")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.rgpd.registryRetention")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RGPD_REGISTRY.map((row, i) => (
                      <tr key={i} className="border-b border-zinc-100 dark:border-slate-800">
                        <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 text-xs">{row.data}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-slate-300 text-xs">{row.purpose}</td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{row.retention}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-medium mb-1">{t("admin.rgpd.title")}</p>
              <ul className="list-disc list-inside text-xs space-y-1">
                <li>Export des données : onglet Utilisateurs &rarr; bouton &quot;Export&quot;</li>
                <li>Suppression de compte : onglet Utilisateurs &rarr; bouton &quot;Suppr.&quot; (anonymise les commentaires et l&apos;activité)</li>
                <li>Droit d&apos;accès (art. 15 RGPD) : export JSON complet de toutes les données d&apos;un utilisateur</li>
                <li>Droit à l&apos;effacement (art. 17 RGPD) : suppression irréversible avec anonymisation</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
