"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  acceptCollaboration,
  declineCollaboration,
  type AppNotification,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

type FilterTab = "all" | "unread" | "read";

const NOTIF_ICON: Record<string, { icon: string; bg: string }> = {
  task_assigned: { icon: "📋", bg: "bg-blue-100 dark:bg-blue-900/30" },
  task_completed: { icon: "✅", bg: "bg-green-100 dark:bg-green-900/30" },
  task_declined: { icon: "❌", bg: "bg-orange-100 dark:bg-orange-900/30" },
  task_accepted: { icon: "✔️", bg: "bg-emerald-50 dark:bg-emerald-800/50" },
  team_invite: { icon: "👥", bg: "bg-violet-100 dark:bg-violet-900/30" },
  deadline_approaching: { icon: "⏰", bg: "bg-amber-100 dark:bg-amber-900/30" },
  deadline_today: { icon: "🔴", bg: "bg-red-100 dark:bg-red-900/30" },
};

function timeAgo(iso: string, t: (k: TranslationKey) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notif.justNow");
  if (mins < 60) return `${mins} ${t("notif.minutesAgo")}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t("notif.hoursAgo")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t("notif.daysAgo")}`;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function notifHref(notif: AppNotification): string {
  if (notif.type === "task_assigned" || notif.type === "task_completed" || notif.type === "task_declined" || notif.type === "task_accepted") {
    return "/todos";
  }
  if (notif.type === "team_invite") return "/teams";
  return "/dashboard";
}

export default function NotificationsPage() {
  const { t, locale } = useLocale();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getNotifications();
        if (!cancelled) setNotifications(list);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleMarkRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    } catch { /* ignore */ }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  }, []);

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "read") return n.read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const emptyMessage = (): string => {
    if (filter === "unread") return t("notif.noUnread");
    if (filter === "read") return t("notif.noRead");
    return t("notif.noNotifications");
  };

  const tabs: { key: FilterTab; tKey: TranslationKey; count?: number }[] = [
    { key: "all", tKey: "notif.all", count: notifications.length },
    { key: "unread", tKey: "notif.unread", count: unreadCount },
    { key: "read", tKey: "notif.read", count: notifications.length - unreadCount },
  ];

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-slate-100">
            {t("notif.pageTitle")}
          </h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="rounded px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
            >
              {t("notif.markAllRead")}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 bg-zinc-100 dark:bg-slate-800 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                filter === tab.key
                  ? "bg-white dark:bg-slate-700 text-zinc-900 dark:text-slate-100 shadow-sm"
                  : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-300"
              }`}
            >
              {t(tab.tKey)}
              {tab.count != null && tab.count > 0 && (
                <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab.key === "unread" && tab.count > 0
                    ? "bg-blue-500 text-white"
                    : "bg-zinc-200 dark:bg-slate-600 text-zinc-600 dark:text-slate-300"
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Notification list */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm text-zinc-400 dark:text-slate-500">{emptyMessage()}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((notif) => {
              const meta = NOTIF_ICON[notif.type] ?? { icon: "🔔", bg: "bg-zinc-100 dark:bg-slate-800" };
              return (
                <div
                  key={notif.id}
                  className={`group rounded-lg border px-4 py-3 flex items-start gap-3 transition-colors ${
                    notif.read
                      ? "bg-white dark:bg-slate-900 border-zinc-200 dark:border-slate-700"
                      : "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base ${meta.bg}`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${notif.read ? "text-zinc-600 dark:text-slate-400" : "text-zinc-900 dark:text-slate-100 font-medium"}`}>
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-zinc-400 dark:text-slate-500">
                        {timeAgo(notif.createdAt, t)}
                      </span>
                      <span className="text-[11px] text-zinc-300 dark:text-slate-600">·</span>
                      <span className="text-[11px] text-zinc-400 dark:text-slate-500">
                        {formatDate(notif.createdAt, locale)}
                      </span>
                    </div>
                    {notif.type === "team_invite" && !notif.read && notif.data?.inviterEmail && (
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await acceptCollaboration(notif.data!.inviterEmail);
                              await handleMarkRead(notif.id);
                              window.dispatchEvent(new Event("collaborators-updated"));
                            } catch { /* ignore */ }
                          }}
                          className="rounded px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          {t("notif.accept")}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await declineCollaboration(notif.data!.inviterEmail);
                              await handleMarkRead(notif.id);
                              window.dispatchEvent(new Event("collaborators-updated"));
                            } catch { /* ignore */ }
                          }}
                          className="rounded px-3 py-1.5 text-xs font-medium border border-zinc-300 dark:border-slate-600 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          {t("notif.decline")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!notif.read && notif.type !== "team_invite" && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(notif.id)}
                        title={t("notif.markAllRead")}
                        className="rounded p-1.5 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    )}
                    {notif.type !== "team_invite" && (
                      <Link
                        href={notifHref(notif)}
                        onClick={() => { if (!notif.read) handleMarkRead(notif.id); }}
                        className="rounded p-1.5 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
