"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import AppShell from "@/components/AppShell";
import {
  getAdminStats, getAdminUsers, getAdminInvites,
  getAdminActivity, getAdminSessions, getAdminIntegrations,
  getAdminUserExport, deleteAdminUser, getAdminCompletionRates,
  postAdminUserBillingPortalSession, patchAdminUserBillingPlan, patchAdminUserEarlyBird,
  postAdminInviteRemind,
  deleteAdminInvite,
  getAdminEngagement,
  getAdminOps,
  getAdminLeads,
  AdminStats, AdminUser, AdminInviteLogEntry,
  ActivityLogEntry, SessionInfo, IntegrationOverview, CompletionRate,
  type AdminEngagementPeriodDays,
  type AdminEngagementSnapshot,
  type AdminOpsSnapshot,
  type AdminPricingLeadsSnapshot,
  type BillingPlan,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
      <p className="text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-slate-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function TrendBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-600 dark:text-slate-400">
        <span>{label}</span>
        <span className="font-medium text-zinc-800 dark:text-slate-200">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-100 dark:bg-slate-800 overflow-hidden">
        <div className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Tab = "stats" | "users" | "engagement" | "activity" | "sessions" | "integrations" | "ops" | "rgpd";

const TABS: Tab[] = ["stats", "users", "engagement", "activity", "sessions", "integrations", "ops", "rgpd"];

const BILLING_PLAN_OPTIONS: BillingPlan[] = ["free", "first", "small", "large"];

const ADMIN_PLAN_LABEL_KEY: Record<BillingPlan, TranslationKey> = {
  free: "settings.plan.free",
  first: "settings.plan.first",
  small: "settings.plan.small",
  large: "settings.plan.large",
};

function stripeOverrideBlocked(u: AdminUser): boolean {
  const st = u.stripeSubscriptionStatus?.trim().toLowerCase();
  return st === "active" || st === "trialing";
}

export default function AdminPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<AdminInviteLogEntry[]>([]);
  const [inviteRemindId, setInviteRemindId] = useState<string | null>(null);
  const [inviteDeletingId, setInviteDeletingId] = useState<string | null>(null);
  const [inviteFlash, setInviteFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationOverview | null>(null);
  const [completionRates, setCompletionRates] = useState<CompletionRate[]>([]);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmUid, setDeleteConfirmUid] = useState<string | null>(null);
  const [billingFlash, setBillingFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [portalLoadingUid, setPortalLoadingUid] = useState<string | null>(null);
  const [planModal, setPlanModal] = useState<{ uid: string; email: string; currentPlan: BillingPlan } | null>(null);
  const [planPick, setPlanPick] = useState<BillingPlan>("first");
  const [planReason, setPlanReason] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [earlyBirdReason, setEarlyBirdReason] = useState("");
  const [earlyBirdSaving, setEarlyBirdSaving] = useState(false);
  const [engagement, setEngagement] = useState<AdminEngagementSnapshot | null>(null);
  const [engagementPeriod, setEngagementPeriod] = useState<AdminEngagementPeriodDays>(7);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [ops, setOps] = useState<AdminOpsSnapshot | null>(null);
  const [leads, setLeads] = useState<AdminPricingLeadsSnapshot | null>(null);
  const [activityUserId, setActivityUserId] = useState("");
  const [activityEntityType, setActivityEntityType] = useState("");
  const [activityAction, setActivityAction] = useState("");
  const [activityFilters, setActivityFilters] = useState({ userId: "", entityType: "", action: "" });

  const refreshUsers = useCallback((syncUid?: string) => {
    getAdminUsers()
      .then((list) => {
        setUsers(list);
        if (syncUid) {
          const nu = list.find((x) => x.uid === syncUid);
          setSelectedUser((prev) => (prev?.uid === syncUid ? nu ?? null : prev));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([getAdminStats(), getAdminUsers(), getAdminInvites()])
      .then(([s, u, i]) => { setStats(s); setUsers(u); setInvites(i); })
      .catch(() => setDenied(true))
      .finally(() => setLoading(false));
  }, []);

  const ACTIVITY_PAGE_SIZE = 100;

  const loadActivity = useCallback((filters = activityFilters, reset = true) => {
    getAdminActivity({
      limit: ACTIVITY_PAGE_SIZE,
      offset: reset ? 0 : undefined,
      userId: filters.userId || undefined,
      entityType: filters.entityType || undefined,
      action: filters.action || undefined,
    })
      .then((r) => {
        if (reset) {
          setActivity(r.entries);
        } else {
          setActivity((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const merged = [...prev];
            for (const e of r.entries) {
              if (!seen.has(e.id)) merged.push(e);
            }
            return merged;
          });
        }
        setActivityTotal(r.total);
      })
      .catch(() => {});
  }, [activityFilters]);

  const loadMoreActivity = useCallback(async () => {
    setActivityLoadingMore(true);
    try {
      const r = await getAdminActivity({
        limit: ACTIVITY_PAGE_SIZE,
        offset: activity.length,
        userId: activityFilters.userId || undefined,
        entityType: activityFilters.entityType || undefined,
        action: activityFilters.action || undefined,
      });
      setActivity((prev) => {
        // Defensive de-dup: if the underlying total grows between fetches the
        // new page may overlap the tail of `prev`. Filter by id to avoid React
        // key collisions and visual duplicates.
        const seen = new Set(prev.map((e) => e.id));
        const merged = [...prev];
        for (const e of r.entries) {
          if (!seen.has(e.id)) merged.push(e);
        }
        return merged;
      });
      setActivityTotal(r.total);
    } catch {
      /* ignore */
    } finally {
      setActivityLoadingMore(false);
    }
  }, [activity.length, activityFilters]);

  const loadEngagement = useCallback((period: AdminEngagementPeriodDays) => {
    setEngagementLoading(true);
    getAdminEngagement(period)
      .then(setEngagement)
      .catch(() => {})
      .finally(() => setEngagementLoading(false));
  }, []);

  const loadOps = useCallback(() => {
    Promise.all([getAdminOps(), getAdminLeads()])
      .then(([o, l]) => { setOps(o); setLeads(l); })
      .catch(() => {});
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

  const refreshInvites = useCallback(() => {
    getAdminInvites().then(setInvites).catch(() => {});
  }, []);

  const handleInviteRemind = async (id: string) => {
    setInviteRemindId(id);
    setInviteFlash(null);
    try {
      await postAdminInviteRemind(id);
      setInviteFlash({ kind: "ok", text: t("admin.inviteResendOk") });
      await refreshInvites();
      const s = await getAdminStats().catch(() => null);
      if (s) setStats(s);
    } catch (e) {
      setInviteFlash({
        kind: "err",
        text: e instanceof Error ? e.message : t("admin.inviteResendError"),
      });
    } finally {
      setInviteRemindId(null);
    }
  };

  const handleInviteDelete = async (id: string) => {
    if (!window.confirm(t("admin.inviteDeleteConfirm"))) return;
    setInviteDeletingId(id);
    setInviteFlash(null);
    try {
      await deleteAdminInvite(id);
      setInviteFlash({ kind: "ok", text: t("admin.inviteDeleteOk") });
      await refreshInvites();
    } catch (e) {
      setInviteFlash({
        kind: "err",
        text: e instanceof Error ? e.message : t("admin.inviteDeleteError"),
      });
    } finally {
      setInviteDeletingId(null);
    }
  };

  useEffect(() => {
    if (tab === "activity" && activity.length === 0) loadActivity();
    if (tab === "sessions" && sessions.length === 0) loadSessions();
    if (tab === "integrations" && !integrations) loadIntegrations();
    if (tab === "users") loadCompletionRates();
    if (tab === "engagement" && !engagement && !engagementLoading) loadEngagement(engagementPeriod);
    if (tab === "ops" && !ops) loadOps();
  }, [tab, activity.length, sessions.length, integrations, engagement, engagementLoading, engagementPeriod, ops, loadActivity, loadSessions, loadIntegrations, loadCompletionRates, loadEngagement, loadOps]);

  useEffect(() => {
    if (tab === "engagement") loadEngagement(engagementPeriod);
  }, [engagementPeriod, tab, loadEngagement]);

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
      setSelectedUser((prev) => (prev?.uid === uid ? null : prev));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (planModal) {
        setPlanModal(null);
        setBillingFlash(null);
      } else if (selectedUser) {
        setSelectedUser(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [planModal, selectedUser]);

  const openPlanModal = (u: AdminUser) => {
    const plan = u.billingPlan ?? "first";
    setPlanModal({ uid: u.uid, email: u.email, currentPlan: plan });
    setPlanPick(plan);
    setPlanReason("");
    setBillingFlash(null);
  };

  const handleOpenBillingPortal = async (u: AdminUser) => {
    setPortalLoadingUid(u.uid);
    setBillingFlash(null);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { url } = await postAdminUserBillingPortalSession(u.uid, {
        returnUrl: origin ? `${origin}/admin` : undefined,
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setBillingFlash({
        kind: "err",
        text: e instanceof Error ? e.message : t("admin.billing.portalError"),
      });
    } finally {
      setPortalLoadingUid(null);
    }
  };

  const handleEarlyBirdPatch = async (next: boolean) => {
    if (!selectedUser) return;
    const reason = earlyBirdReason.trim();
    if (reason.length < 3) {
      setBillingFlash({
        kind: "err",
        text: t("admin.earlyBird.reasonRequired"),
      });
      return;
    }
    setEarlyBirdSaving(true);
    setBillingFlash(null);
    try {
      await patchAdminUserEarlyBird(selectedUser.uid, next, reason);
      setBillingFlash({ kind: "ok", text: t("admin.earlyBird.updated") });
      setEarlyBirdReason("");
      refreshUsers(selectedUser.uid);
    } catch (e) {
      setBillingFlash({
        kind: "err",
        text: e instanceof Error ? e.message : t("admin.billing.planError"),
      });
    } finally {
      setEarlyBirdSaving(false);
    }
  };

  const handlePlanModalSubmit = async () => {
    if (!planModal) return;
    setPlanSaving(true);
    setBillingFlash(null);
    try {
      await patchAdminUserBillingPlan(planModal.uid, planPick, planReason);
      setBillingFlash({ kind: "ok", text: t("admin.billing.planUpdated") });
      setPlanModal(null);
      refreshUsers(planModal.uid);
    } catch (e) {
      setBillingFlash({
        kind: "err",
        text: e instanceof Error ? e.message : t("admin.billing.planError"),
      });
    } finally {
      setPlanSaving(false);
    }
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

  const applyActivityFilters = () => {
    const next = { userId: activityUserId, entityType: activityEntityType, action: activityAction };
    setActivityFilters(next);
    loadActivity(next, true);
  };

  const exportActivityCsv = () => {
    const header = ["date", "userEmail", "action", "entityType", "entityId"];
    const rows = activity.map((a) => [
      a.createdAt,
      a.userEmail,
      a.action,
      a.entityType,
      a.entityId,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wroket-admin-activity.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sessionCountByUid = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.uid] = (acc[s.uid] ?? 0) + 1;
    return acc;
  }, {});

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
              {inviteFlash && (
                <div
                  role="status"
                  className={`rounded-lg px-4 py-2 text-sm mb-3 ${
                    inviteFlash.kind === "ok"
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
                      : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
                  }`}
                >
                  {inviteFlash.text}
                </div>
              )}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteFrom")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteTo")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteDate")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteStatus")}</th>
                      <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.inviteReminderCol")}</th>
                      <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-slate-400 w-32">{t("admin.inviteResend")}</th>
                      <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-slate-400 w-28">{t("admin.inviteDelete")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => {
                      const statusKey =
                        inv.status === "converted"
                          ? "admin.inviteStatusConverted"
                          : inv.status === "pending"
                            ? "admin.inviteStatusPending"
                            : "admin.inviteStatusExisting";
                      const statusClass =
                        inv.status === "converted"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : inv.status === "pending"
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-zinc-500 dark:text-slate-400";
                      let reminderCell: ReactNode = "—";
                      if (inv.reminderSentAt) {
                        reminderCell = (
                          <span className="text-xs">
                            {t("admin.inviteRemindedAt")}{" "}
                            <span className="text-zinc-700 dark:text-slate-300">{formatDateTime(inv.reminderSentAt)}</span>
                          </span>
                        );
                      } else if (inv.status === "pending" && inv.eligibleResendAt) {
                        reminderCell = (
                          <span className="text-xs text-zinc-600 dark:text-slate-400">
                            {t("admin.inviteEligibleFrom")} {formatDate(inv.eligibleResendAt)}
                          </span>
                        );
                      }
                      let resendTitle: string | undefined;
                      if (!inv.canResend) {
                        if (inv.reminderSentAt) {
                          resendTitle = `${t("admin.inviteRemindedAt")} ${formatDateTime(inv.reminderSentAt)}`;
                        } else if (inv.status === "pending" && inv.eligibleResendAt) {
                          resendTitle = `${t("admin.inviteEligibleFrom")} ${formatDate(inv.eligibleResendAt)}`;
                        } else if (inv.status === "converted") {
                          resendTitle = t("admin.inviteNoResendConverted");
                        } else if (inv.status === "existing_account") {
                          resendTitle = t("admin.inviteNoResendExisting");
                        }
                      }
                      return (
                        <tr key={inv.id} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{inv.fromEmail}</td>
                          <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{inv.toEmail}</td>
                          <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{formatDate(inv.sentAt)}</td>
                          <td className={`px-4 py-3 text-xs font-medium ${statusClass}`}>{t(statusKey as TranslationKey)}</td>
                          <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs max-w-[14rem]">{reminderCell}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex justify-end max-w-full" title={inv.canResend ? undefined : resendTitle}>
                              <button
                                type="button"
                                disabled={!inv.canResend || inviteRemindId === inv.id}
                                onClick={() => void handleInviteRemind(inv.id)}
                                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-800 dark:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                {inviteRemindId === inv.id ? t("admin.inviteResending") : t("admin.inviteResend")}
                              </button>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={inviteDeletingId === inv.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInviteDelete(inv.id);
                              }}
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-45 disabled:cursor-not-allowed"
                            >
                              {inviteDeletingId === inv.id ? t("loading") : t("admin.inviteDelete")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {invites.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">
                          {t("admin.noInvites")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Users tab */}
        {tab === "users" && (
          <div className="space-y-3">
            {billingFlash && !planModal && (
              <div
                role="status"
                className={`rounded-lg px-4 py-2 text-sm ${
                  billingFlash.kind === "ok"
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200"
                    : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200"
                }`}
              >
                {billingFlash.text}
              </div>
            )}
            <p className="text-xs text-zinc-500 dark:text-slate-400">{t("admin.users.rowHint")}</p>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.email")}</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.name")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.verified")}</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400 whitespace-nowrap">{t("admin.billing.planCol")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.taskCount")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.userProjectCount")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.notes")}</th>
                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.completionRate")}</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.joined")}</th>
                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.lastLogin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const rate = rateForUser(u.uid);
                    const effPlan = (u.billingPlan ?? "first") as BillingPlan;
                    return (
                      <tr
                        key={u.uid}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setSelectedUser(u); setBillingFlash(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedUser(u);
                            setBillingFlash(null);
                          }
                        }}
                        className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">{u.email}</td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-slate-300">{u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`.trim() : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {u.emailVerified
                            ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title={t("admin.verifiedTooltip")} />
                            : <span className="inline-block w-2 h-2 rounded-full bg-zinc-300 dark:bg-slate-600" title={t("admin.unverifiedTooltip")} />}
                        </td>
                        <td className="px-4 py-3 text-zinc-800 dark:text-slate-200 text-xs whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{t(ADMIN_PLAN_LABEL_KEY[effPlan])}</span>
                            {u.earlyBird ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200">
                                {t("settings.earlyBirdBadge")}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{u.taskCount}</td>
                        <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{u.projectCount ?? 0}</td>
                        <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{u.noteCount ?? 0}</td>
                        <td className="px-4 py-3 text-center text-zinc-700 dark:text-slate-300">{rate ? `${rate.rate}%` : "—"}</td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedUser && (
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-user-detail-title"
                onClick={() => { setSelectedUser(null); setEarlyBirdReason(""); }}
              >
                <div
                  className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 id="admin-user-detail-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                        {t("admin.users.detailTitle")}
                      </h2>
                      <p className="text-xs font-mono text-zinc-600 dark:text-slate-400 mt-1 break-all">{selectedUser.email}</p>
                      <p className="text-sm text-zinc-700 dark:text-slate-300 mt-1">
                        {selectedUser.firstName || selectedUser.lastName ? `${selectedUser.firstName} ${selectedUser.lastName}`.trim() : "—"}
                      </p>
                      <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 mt-2 flex flex-wrap items-center gap-2">
                        <span>
                          {t("admin.billing.planCol")}: {t(ADMIN_PLAN_LABEL_KEY[(selectedUser.billingPlan ?? "first") as BillingPlan])}
                        </span>
                        {selectedUser.earlyBird ? (
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-200">
                            {t("settings.earlyBirdBadge")}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-slate-200 text-xl leading-none px-1"
                      aria-label={t("cancel")}
                      onClick={() => { setSelectedUser(null); setEarlyBirdReason(""); }}
                    >
                      ×
                    </button>
                  </div>

                  <section className="space-y-3 border-t border-zinc-100 dark:border-slate-800 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400">{t("admin.users.sectionBilling")}</h3>
                    <dl className="grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500 dark:text-slate-400">{t("admin.billing.stripeCol")}</dt>
                        <dd className={selectedUser.stripeLinked ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-zinc-700 dark:text-slate-300"}>
                          {selectedUser.stripeLinked ? t("admin.billing.linked") : t("admin.billing.notLinked")}
                        </dd>
                      </div>
                      {selectedUser.stripeSubscriptionStatus ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500 dark:text-slate-400">{t("settings.stripeStatusLabel")}</dt>
                          <dd className="font-mono text-xs text-zinc-700 dark:text-slate-300">{selectedUser.stripeSubscriptionStatus}</dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500 dark:text-slate-400">{t("admin.billing.periodEndCol")}</dt>
                        <dd className="text-zinc-700 dark:text-slate-300 text-xs">
                          {selectedUser.billingCurrentPeriodEnd ? formatDateTime(selectedUser.billingCurrentPeriodEnd) : "—"}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!selectedUser.stripeLinked || portalLoadingUid === selectedUser.uid}
                        onClick={() => handleOpenBillingPortal(selectedUser)}
                        className="text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-medium px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={selectedUser.stripeLinked ? t("admin.billing.portalTitle") : t("admin.billing.notLinked")}
                      >
                        {portalLoadingUid === selectedUser.uid ? "…" : t("admin.billing.openPortal")}
                      </button>
                      <button
                        type="button"
                        disabled={stripeOverrideBlocked(selectedUser)}
                        onClick={() => openPlanModal(selectedUser)}
                        className="text-sm rounded-lg border border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 font-medium px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={stripeOverrideBlocked(selectedUser) ? t("admin.billing.overrideBlocked") : t("admin.billing.changePlan")}
                      >
                        {t("admin.billing.changePlan")}
                      </button>
                    </div>
                  </section>

                  <section className="space-y-3 border-t border-zinc-100 dark:border-slate-800 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400">{t("admin.earlyBird.sectionTitle")}</h3>
                    <p className="text-xs text-zinc-500 dark:text-slate-400">{t("admin.earlyBird.description")}</p>
                    <p className="text-sm text-zinc-800 dark:text-slate-200">
                      <span className="text-zinc-500 dark:text-slate-400">{t("admin.earlyBird.statusPrefix")}: </span>
                      <span className="font-medium">
                        {selectedUser.earlyBird ? t("admin.earlyBird.statusOn") : t("admin.earlyBird.statusOff")}
                      </span>
                    </p>
                    <div>
                      <label htmlFor="admin-early-bird-reason" className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                        {t("admin.billing.reasonLabel")}
                      </label>
                      <textarea
                        id="admin-early-bird-reason"
                        rows={2}
                        className="w-full rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 text-sm px-3 py-2"
                        placeholder={t("admin.billing.reasonPlaceholder")}
                        value={earlyBirdReason}
                        onChange={(e) => setEarlyBirdReason(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={earlyBirdSaving || selectedUser.earlyBird}
                        onClick={() => handleEarlyBirdPatch(true)}
                        className="text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {earlyBirdSaving ? "…" : t("admin.earlyBird.grant")}
                      </button>
                      <button
                        type="button"
                        disabled={earlyBirdSaving || !selectedUser.earlyBird}
                        onClick={() => handleEarlyBirdPatch(false)}
                        className="text-sm rounded-lg border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300 font-medium px-3 py-2 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {earlyBirdSaving ? "…" : t("admin.earlyBird.revoke")}
                      </button>
                    </div>
                  </section>

                  <section className="space-y-3 border-t border-zinc-100 dark:border-slate-800 pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-slate-400">{t("admin.users.sectionRgpd")}</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportUser(selectedUser.uid)}
                        className="text-sm rounded-lg border border-zinc-200 dark:border-slate-600 text-blue-600 dark:text-blue-400 font-medium px-3 py-2 hover:bg-zinc-50 dark:hover:bg-slate-800"
                      >
                        {t("admin.exportShort")}
                      </button>
                      {deleteConfirmUid === selectedUser.uid ? (
                        <span className="inline-flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-zinc-600 dark:text-slate-400">{t("admin.rgpd.deleteConfirm")}</span>
                          <button type="button" onClick={() => handleDeleteUser(selectedUser.uid)} className="text-red-600 font-medium">{t("confirm")}</button>
                          <button type="button" onClick={() => setDeleteConfirmUid(null)} className="text-zinc-500">{t("cancel")}</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmUid(selectedUser.uid)}
                          className="text-sm rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-medium px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          {t("admin.rgpd.delete")}
                        </button>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {planModal && (
              <div
                className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-plan-modal-title"
                onClick={() => { setPlanModal(null); setBillingFlash(null); }}
              >
                <div
                  className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 shadow-xl max-w-md w-full p-5 space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 id="admin-plan-modal-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                    {t("admin.billing.modalTitle")}
                  </h2>
                  <p className="text-xs font-mono text-zinc-500 dark:text-slate-400 break-all">{planModal.email}</p>
                  <div>
                    <label htmlFor="admin-plan-pick" className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                      {t("admin.billing.planCol")}
                    </label>
                    <select
                      id="admin-plan-pick"
                      className="w-full rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 text-sm px-3 py-2"
                      value={planPick}
                      onChange={(e) => setPlanPick(e.target.value as BillingPlan)}
                    >
                      {BILLING_PLAN_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {t(`settings.plan.${p}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="admin-plan-reason" className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                      {t("admin.billing.reasonLabel")}
                    </label>
                    <textarea
                      id="admin-plan-reason"
                      rows={3}
                      className="w-full rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 text-sm px-3 py-2"
                      placeholder={t("admin.billing.reasonPlaceholder")}
                      value={planReason}
                      onChange={(e) => setPlanReason(e.target.value)}
                    />
                  </div>
                  {billingFlash?.kind === "err" && (
                    <p className="text-sm text-red-600 dark:text-red-400">{billingFlash.text}</p>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-slate-600 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
                      onClick={() => { setPlanModal(null); setBillingFlash(null); }}
                    >
                      {t("admin.billing.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={planSaving}
                      className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                      onClick={handlePlanModalSubmit}
                    >
                      {planSaving ? "…" : t("admin.billing.submit")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Engagement tab */}
        {tab === "engagement" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="admin-engagement-period" className="text-sm text-zinc-600 dark:text-slate-400">
                {t("admin.engagement.period")}
              </label>
              <select
                id="admin-engagement-period"
                value={engagementPeriod}
                onChange={(e) => setEngagementPeriod(Number(e.target.value) as AdminEngagementPeriodDays)}
                className="rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-3 py-1.5"
              >
                {([7, 14, 30] as const).map((d) => (
                  <option key={d} value={d}>{t("admin.engagement.periodDays").replace("{n}", String(d))}</option>
                ))}
              </select>
            </div>

            {engagementLoading && !engagement ? (
              <p className="text-sm text-zinc-500">{t("admin.activity.loadingMore")}</p>
            ) : engagement ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label={t("admin.engagement.dau")} value={engagement.activeUsers.dau} sub={t("admin.engagement.ofTotal").replace("{total}", String(engagement.activeUsers.totalUsers))} />
                  <StatCard label={t("admin.engagement.wau")} value={engagement.activeUsers.wau} sub={t("admin.engagement.ofTotal").replace("{total}", String(engagement.activeUsers.totalUsers))} />
                  <StatCard label={t("admin.engagement.mau")} value={engagement.activeUsers.mau} sub={t("admin.engagement.ofTotal").replace("{total}", String(engagement.activeUsers.totalUsers))} />
                  <StatCard label={t("admin.engagement.verificationRate")} value={`${engagement.growth.emailVerificationRate}%`} />
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.engagement.taskSummary")}</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatCard label={t("admin.engagement.active")} value={engagement.tasks.summary.active} />
                    <StatCard label={t("admin.engagement.created")} value={engagement.tasks.summary.createdInPeriod} />
                    <StatCard label={t("admin.engagement.completed")} value={engagement.tasks.summary.completedInPeriod} />
                    <StatCard label={t("admin.engagement.cancelled")} value={engagement.tasks.summary.cancelledInPeriod} />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">{t("admin.engagement.weeklyTrends")}</h3>
                    {(() => {
                      const max = Math.max(1, ...engagement.growth.weeklyTrends.map((w) => Math.max(w.signups, w.completions)));
                      return engagement.growth.weeklyTrends.map((w) => (
                        <div key={w.weekStartUtc} className="space-y-2 border-b border-zinc-100 dark:border-slate-800 pb-3 last:border-0">
                          <p className="text-xs text-zinc-500">{w.weekStartUtc} → {w.weekEndUtc}</p>
                          <TrendBar value={w.signups} max={max} label={t("admin.engagement.signups")} />
                          <TrendBar value={w.completions} max={max} label={t("admin.engagement.completions")} />
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">{t("admin.engagement.velocity")}</h3>
                    {(() => {
                      const max = Math.max(1, ...engagement.tasks.velocityWeeks.map((w) => w.completed));
                      return engagement.tasks.velocityWeeks.map((w) => (
                        <TrendBar key={w.weekStartUtc} value={w.completed} max={max} label={`${w.weekStartUtc}`} />
                      ));
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {([
                    ["admin.engagement.byStatus", engagement.tasks.byStatus],
                    ["admin.engagement.byPriority", engagement.tasks.byPriority],
                    ["admin.engagement.byEffort", engagement.tasks.byEffort],
                  ] as const).map(([titleKey, map]) => (
                    <div key={titleKey} className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
                      <h3 className="text-xs font-semibold uppercase text-zinc-500 mb-2">{t(titleKey)}</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(map).map(([k, v]) => (
                          <span key={k} className="text-xs rounded-full bg-zinc-100 dark:bg-slate-800 px-2 py-1">
                            {k} <strong>{v}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.engagement.adoption")}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {engagement.adoption.map((item) => {
                      const labelKey = `admin.engagement.adoption.${item.key}` as TranslationKey;
                      return (
                        <StatCard
                          key={item.key}
                          label={t(labelKey)}
                          value={item.count}
                          sub={`${item.percent}%`}
                        />
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Activity tab */}
        {tab === "activity" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 p-4">
              <div>
                <label htmlFor="activity-filter-user" className="block text-xs text-zinc-500 mb-1">{t("admin.activity.filterUser")}</label>
                <select
                  id="activity-filter-user"
                  value={activityUserId}
                  onChange={(e) => setActivityUserId(e.target.value)}
                  className="rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-2 py-1.5 min-w-[180px]"
                >
                  <option value="">{t("admin.activity.all")}</option>
                  {users.map((u) => (
                    <option key={u.uid} value={u.uid}>{u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="activity-filter-entity" className="block text-xs text-zinc-500 mb-1">{t("admin.activity.filterEntity")}</label>
                <input
                  id="activity-filter-entity"
                  value={activityEntityType}
                  onChange={(e) => setActivityEntityType(e.target.value)}
                  placeholder="todo, note, project, database…"
                  className="rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-2 py-1.5 w-36"
                />
              </div>
              <div>
                <label htmlFor="activity-filter-action" className="block text-xs text-zinc-500 mb-1">{t("admin.activity.filterAction")}</label>
                <input
                  id="activity-filter-action"
                  value={activityAction}
                  onChange={(e) => setActivityAction(e.target.value)}
                  placeholder="todo_created, admin_billing_plan…"
                  className="rounded-lg border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm px-2 py-1.5 w-44"
                />
              </div>
              <button
                type="button"
                onClick={applyActivityFilters}
                className="text-sm rounded-lg bg-emerald-600 text-white px-3 py-1.5 hover:bg-emerald-700"
              >
                {t("admin.activity.applyFilters")}
              </button>
              <button
                type="button"
                onClick={exportActivityCsv}
                disabled={activity.length === 0}
                className="text-sm rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 disabled:opacity-40"
              >
                {t("admin.activity.exportCsv")}
              </button>
            </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
            <div className="px-4 py-2 text-xs text-zinc-400 dark:text-slate-500 border-b border-zinc-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <span>
                {t("admin.activity.shownCount")
                  .replace("{shown}", String(activity.length))
                  .replace("{total}", String(activityTotal))}
              </span>
              <span>{activityTotal} {t("admin.activity.action").toLowerCase()}(s)</span>
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
                        a.action === "admin_billing_portal" || a.action === "admin_billing_plan" || a.action === "admin_early_bird"
                          || a.action === "admin_user_export" || a.action === "admin_user_delete"
                          ? "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300"
                          : "bg-zinc-100 dark:bg-slate-800 text-zinc-600 dark:text-slate-400"
                      }`}>{a.action}</span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-slate-300 text-xs">
                      {a.entityType} <span className="text-zinc-400 dark:text-slate-500">{(() => {
                        const d = (a.details ?? {}) as Record<string, unknown>;
                        const label = (d.title ?? d.name) as string | undefined;
                        const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];
                        return `${label ? `— ${label}` : ""}${fields.length ? ` [${fields.join(", ")}]` : ""}`;
                      })()}</span>
                    </td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">{t("admin.activity.empty")}</td></tr>
                )}
              </tbody>
            </table>
            {activity.length < activityTotal && (
              <div className="px-4 py-3 border-t border-zinc-200 dark:border-slate-700 flex justify-center">
                <button
                  type="button"
                  onClick={loadMoreActivity}
                  disabled={activityLoadingMore}
                  className="px-4 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {activityLoadingMore ? t("admin.activity.loadingMore") : t("admin.activity.loadMore")}
                </button>
              </div>
            )}
          </div>
          </div>
        )}

        {/* Sessions tab */}
        {tab === "sessions" && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.sessions.email")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.sessions.createdAt")}</th>
                  <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-slate-400">{t("admin.sessions.expires")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={`${s.uid}-${i}`} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-zinc-900 dark:text-slate-100 font-mono text-xs">
                      {s.email}
                      {(sessionCountByUid[s.uid] ?? 0) > 1 && (
                        <span className="ml-2 inline-flex rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold px-1.5 py-0.5">
                          {t("admin.sessions.multi")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs whitespace-nowrap">
                      {s.createdAt ? formatDateTime(new Date(s.createdAt).toISOString()) : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-slate-400 text-xs whitespace-nowrap">{formatDateTime(new Date(s.expiresAt).toISOString())}</td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-400 dark:text-slate-500">{t("admin.sessions.empty")}</td></tr>
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
              <StatCard label={t("admin.integrations.microsoft")} value={integrations.microsoftCalendarConnected ?? 0} />
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

        {/* Ops tab */}
        {tab === "ops" && ops && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label={t("admin.ops.status")}
                value={ops.status === "ok" ? t("admin.ops.ok") : t("admin.ops.degraded")}
                sub={ops.store.backend}
              />
              <StatCard label={t("admin.uptime")} value={formatUptime(ops.uptime)} />
              <StatCard label={t("admin.ops.sessions")} value={ops.sessions.total} />
              <StatCard label={t("admin.ops.multiSession")} value={ops.sessions.usersWithMultiple} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`rounded-xl border p-4 ${ops.persistence.consecutiveFlushFailures > 0 ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20" : "border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-2">{t("admin.ops.persistence")}</h3>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt className="text-zinc-500">{t("admin.ops.flushFailures")}</dt><dd className="font-mono">{ops.persistence.consecutiveFlushFailures}</dd></div>
                  <div className="flex justify-between"><dt className="text-zinc-500">{t("admin.ops.lastFlush")}</dt><dd className="text-xs">{ops.persistence.lastFlushAt ? formatDateTime(ops.persistence.lastFlushAt) : "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-zinc-500">{t("admin.ops.dirtyDomains")}</dt><dd className="font-mono">{ops.persistence.dirtyDomainsCount}</dd></div>
                  <div className="flex justify-between"><dt className="text-zinc-500">{t("admin.ops.dirtyShards")}</dt><dd className="font-mono">{ops.persistence.dirtyShardsCount}</dd></div>
                </dl>
              </div>
              <div className={`rounded-xl border p-4 ${ops.todosDrift.status === "drift" || ops.todosDrift.status === "error" ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20" : "border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900"}`}>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-2">{t("admin.ops.drift")}</h3>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt className="text-zinc-500">status</dt><dd className="font-mono">{ops.todosDrift.status}</dd></div>
                  <div className="flex justify-between"><dt className="text-zinc-500">source</dt><dd className="font-mono text-xs">{ops.todosDrift.source ?? "—"}</dd></div>
                  {ops.todosDrift.countDriftOwners != null && (
                    <div className="flex justify-between"><dt className="text-zinc-500">drift owners</dt><dd className="font-mono">{ops.todosDrift.countDriftOwners}</dd></div>
                  )}
                </dl>
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              <a
                href="https://console.cloud.google.com/monitoring?project=involuted-reach-490718-h4"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {t("admin.ops.monitoring")}
              </a>
            </p>

            {leads && (
              <div>
                <div className="flex flex-wrap gap-3 mb-3">
                  <StatCard label={t("admin.ops.leads7d")} value={leads.last7d} />
                  <StatCard label={t("admin.ops.leads30d")} value={leads.last30d} />
                </div>
                <h2 className="text-sm font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide mb-3">{t("admin.ops.leads")}</h2>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-zinc-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/50">
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">{t("admin.email")}</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">{t("admin.ops.leadTier")}</th>
                        <th className="text-left px-4 py-3 font-medium text-zinc-500">{t("admin.ops.leadDate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.leads.map((lead) => (
                        <tr key={lead.email} className="border-b border-zinc-100 dark:border-slate-800">
                          <td className="px-4 py-3 font-mono text-xs">{lead.email}</td>
                          <td className="px-4 py-3 text-xs">{lead.lastTier ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(lead.lastSubmittedAt)}</td>
                        </tr>
                      ))}
                      {leads.leads.length === 0 && (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-400">{t("admin.ops.noLeads")}</td></tr>
                      )}
                    </tbody>
                  </table>
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
                <li>{t("admin.rgpd.hintExportRow")}</li>
                <li>{t("admin.rgpd.hintDeleteRow")}</li>
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
