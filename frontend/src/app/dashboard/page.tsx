"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getTodos, getNotifications, Todo, AppNotification } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import { getLocale } from "@/lib/i18n";

type Quadrant = "do-first" | "schedule" | "delegate" | "eliminate";

const URGENCY_THRESHOLD_DAYS = 3;

function classify(todo: Todo): Quadrant {
  const important = todo.priority === "high" || todo.priority === "medium";
  const eff = todo.effort ?? "medium";

  if (todo.deadline) {
    const daysLeft =
      (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysLeft <= 1) {
      if (!important && eff === "heavy") return "delegate";
      return "do-first";
    }

    if (daysLeft <= URGENCY_THRESHOLD_DAYS) {
      if (important) return "do-first";
      if (eff === "heavy") return "eliminate";
      return "delegate";
    }
  }

  if (important) return eff === "light" ? "do-first" : "schedule";
  return eff === "light" ? "delegate" : "eliminate";
}

import type { TranslationKey } from "@/lib/i18n";

const QUADRANT_LABELS: Record<Quadrant, { tKey: TranslationKey; emoji: string; cls: string }> = {
  "do-first": { tKey: "filter.doFirst", emoji: "🔥", cls: "bg-red-500 text-white" },
  schedule:   { tKey: "filter.schedule", emoji: "📅", cls: "bg-blue-500 text-white" },
  delegate:   { tKey: "filter.delegate", emoji: "⚡", cls: "bg-amber-500 text-white" },
  eliminate:  { tKey: "filter.eliminate", emoji: "⏸️", cls: "bg-emerald-400 text-white" },
};

function deadlineLabel(d: string, t: (k: TranslationKey) => string): { text: string; cls: string; urgent: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const loc = getLocale() === "en" ? "en-US" : "fr-FR";

  if (diff < 0) return { text: t("deadline.overdue"), cls: "text-red-600 dark:text-red-400", urgent: true };
  if (diff === 0) return { text: t("deadline.today"), cls: "text-red-600 dark:text-red-400", urgent: true };
  if (diff === 1) return { text: t("deadline.tomorrow"), cls: "text-amber-600 dark:text-amber-400", urgent: true };
  if (diff <= 3) return { text: `${diff}${t("deadline.daysLeft")}`, cls: "text-amber-600 dark:text-amber-400", urgent: true };
  return { text: target.toLocaleDateString(loc, { day: "numeric", month: "short" }), cls: "text-zinc-500 dark:text-slate-400", urgent: false };
}

export default function DashboardPage() {
  const { t } = useLocale();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [recentNotifs, setRecentNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, notifs] = await Promise.all([getTodos(), getNotifications()]);
        if (!cancelled) {
          setTodos(list);
          setRecentNotifs(notifs.slice(0, 5));
        }
      } catch {
        /* handled by AppShell auth redirect */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const active = todos.filter((td) => td.status === "active");
  const completed = todos.filter((td) => td.status === "completed");

  const grouped: Record<Quadrant, Todo[]> = {
    "do-first": active.filter((td) => classify(td) === "do-first"),
    schedule: active.filter((td) => classify(td) === "schedule"),
    delegate: active.filter((td) => classify(td) === "delegate"),
    eliminate: active.filter((td) => classify(td) === "eliminate"),
  };

  const urgentTodos = active
    .filter((td) => {
      if (!td.deadline) return false;
      const dl = deadlineLabel(td.deadline, t);
      return dl.urgent;
    })
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5);

  const recentlyCompleted = completed
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const completionRate = todos.length > 0
    ? Math.round((completed.length / todos.length) * 100)
    : 0;

  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);

  const completedThisWeek = completed.filter(
    (td) => new Date(td.updatedAt).getTime() >= startOfWeek.getTime()
  );
  const completedOnTime = completedThisWeek.filter((td) => {
    if (!td.deadline) return true;
    return new Date(td.updatedAt) <= new Date(td.deadline + "T23:59:59");
  });
  const completedLate = completedThisWeek.filter((td) => {
    if (!td.deadline) return false;
    return new Date(td.updatedAt) > new Date(td.deadline + "T23:59:59");
  });

  return (
    <AppShell>
      <div className="max-w-[1200px] space-y-6">
        {/* ── Title ── */}
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("dashboard.title")}</h2>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("dashboard.subtitle")}</p>
        </div>

        {loading ? (
          <p className="text-zinc-400 dark:text-slate-500 text-sm py-8 text-center">{t("loading")}</p>
        ) : (
          <>
            {/* ── Stats cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label={t("dashboard.activeTasks")} value={active.length} accent="bg-blue-500" />
              <StatCard label={t("dashboard.completed")} value={completed.length} accent="bg-green-500" />
              <StatCard label={t("dashboard.completionRate")} value={`${completionRate}%`} accent="bg-violet-500" />
              <StatCard label={t("dashboard.overdue")} value={active.filter((td) => td.deadline && deadlineLabel(td.deadline, t).urgent && deadlineLabel(td.deadline, t).text === t("deadline.overdue")).length} accent="bg-red-500" />
            </div>

            {/* ── Eisenhower summary ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(["do-first", "schedule", "delegate", "eliminate"] as Quadrant[]).map((q) => {
                const info = QUADRANT_LABELS[q];
                return (
                  <div key={q} className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${info.cls}`}>{info.emoji} {t(info.tKey)}</span>
                    </div>
                    <p className="text-3xl font-bold text-zinc-900 dark:text-slate-100">{grouped[q].length}</p>
                    <p className="text-xs text-zinc-400 dark:text-slate-500 mt-1">
                      {grouped[q].length === 0 ? t("dashboard.noTask") : `${grouped[q].length} ${grouped[q].length > 1 ? t("dashboard.tasksCount") : t("dashboard.taskCount")}`}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── Urgent tasks ── */}
              <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t("dashboard.upcomingDeadlines")}
                </h3>
                {urgentTodos.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500">{t("dashboard.noUrgent")}</p>
                ) : (
                  <ul className="space-y-3">
                    {urgentTodos.map((todo) => {
                      const dl = deadlineLabel(todo.deadline!, t);
                      const badge = QUADRANT_LABELS[classify(todo)];
                      return (
                        <li key={todo.id} className="flex items-center gap-3">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{t(badge.tKey)}</span>
                          <span className="text-sm text-zinc-800 dark:text-slate-200 truncate flex-1">{todo.title}</span>
                          <span className={`text-xs font-medium shrink-0 ${dl.cls}`}>{dl.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {active.filter((td) => td.deadline && deadlineLabel(td.deadline, t).urgent).length > 5 && (
                  <a href="/todos" className="block text-xs text-blue-600 dark:text-blue-400 mt-3 hover:underline">{t("dashboard.viewAll")}</a>
                )}
              </div>

              {/* ── Recently completed ── */}
              <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t("dashboard.recentCompleted")}
                </h3>
                {recentlyCompleted.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500">{t("dashboard.noCompleted")}</p>
                ) : (
                  <ul className="space-y-3">
                    {recentlyCompleted.map((todo) => (
                      <li key={todo.id} className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-zinc-500 dark:text-slate-400 line-through truncate flex-1">{todo.title}</span>
                        <span className="text-xs text-zinc-400 dark:text-slate-500 shrink-0">
                          {new Date(todo.updatedAt).toLocaleDateString(getLocale() === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Weekly summary ── */}
            <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {t("dashboard.weeklySummary")}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center py-3 rounded bg-zinc-50 dark:bg-slate-800/50">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{completedThisWeek.length}</p>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("dashboard.weekCompleted")}</p>
                </div>
                <div className="text-center py-3 rounded bg-green-50 dark:bg-green-950/30">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{completedOnTime.length}</p>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("dashboard.onTime")}</p>
                </div>
                <div className="text-center py-3 rounded bg-red-50 dark:bg-red-950/30">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{completedLate.length}</p>
                  <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("dashboard.late")}</p>
                </div>
              </div>
            </div>

            {/* ── Recent notifications ── */}
            <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {t("dashboard.notifications")}
              </h3>
              {recentNotifs.length === 0 ? (
                <p className="text-sm text-zinc-400 dark:text-slate-500">{t("dashboard.noNotifications")}</p>
              ) : (
                <ul className="space-y-3">
                  {recentNotifs.map((notif) => (
                    <li key={notif.id} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${notif.read ? "bg-zinc-300 dark:bg-slate-600" : "bg-blue-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-800 dark:text-slate-200 truncate">{notif.message}</p>
                        <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-0.5">
                          {new Date(notif.createdAt).toLocaleDateString(getLocale() === "en" ? "en-US" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Quick link ── */}
            <div className="flex gap-3">
              <a
                href="/todos"
                className="inline-flex items-center gap-2 rounded bg-slate-700 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t("dashboard.manageTasks")}
              </a>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4 flex items-start gap-3">
      <div className={`w-2 h-10 rounded-full ${accent} shrink-0`} />
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{value}</p>
        <p className="text-xs text-zinc-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}
