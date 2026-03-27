"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getMe,
  logout,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  AuthMeResponse,
  AppNotification,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

interface AppShellProps {
  children: ReactNode;
}

import type { TranslationKey } from "@/lib/i18n";

const NAV_ITEMS: { tKey: TranslationKey; href: string; icon: ReactNode }[] = [
  {
    tKey: "nav.home",
    href: "/dashboard",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    tKey: "nav.projects",
    href: "/projects",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    tKey: "nav.teams",
    href: "/teams",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

const TASKS_NAV = {
  tKey: "nav.tasks" as TranslationKey,
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  children: [
    { tKey: "nav.myTasks" as TranslationKey, href: "/todos" },
    { tKey: "nav.delegated" as TranslationKey, href: "/todos/delegated" },
  ],
};

const SETTINGS_ITEM = {
  tKey: "nav.settings" as TranslationKey,
  href: "/settings",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

function NavLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
          : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
      }`}
    >
      {icon}
      {label}
    </a>
  );
}

function timeAgo(iso: string, t: (k: import("@/lib/i18n").TranslationKey) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notif.justNow");
  if (mins < 60) return `${mins} ${t("notif.minutesAgo")}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t("notif.hoursAgo")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t("notif.daysAgo")}`;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { t } = useLocale();
  const [darkMode, setDarkMode] = useState(false);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [tasksOpen, setTasksOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("wroket-dark", next ? "1" : "0");
      return next;
    });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("wroket-dark");
    if (stored === "1") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/todos")) setTasksOpen(true);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (!cancelled) setMe(user);
      } catch {
        if (!cancelled) window.location.href = "/login";
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const c = await getUnreadCount();
        if (!cancelled) setUnreadCount(c);
      } catch { /* ignore */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const close = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [notifOpen]);

  const openNotifPanel = async () => {
    setNotifOpen((prev) => !prev);
    if (!notifOpen) {
      try {
        const list = await getNotifications();
        setNotifications(list);
      } catch { /* ignore */ }
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleLogout = async () => {
    try { await logout(); } finally { window.location.href = "/login"; }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-slate-950">
        <span className="text-zinc-400 dark:text-slate-500 text-sm">{t("loading")}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-slate-950 transition-colors">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-zinc-200 dark:border-slate-700 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-slate-700 dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-slate-900 text-sm font-bold">W</span>
            </div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-slate-100 leading-tight">Wroket</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/settings" className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors">
              <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {me?.firstName ? me.firstName.charAt(0).toUpperCase() : me?.email?.charAt(0).toUpperCase() ?? "?"}
                </span>
              </div>
              <span className="text-sm text-zinc-700 dark:text-slate-300 hidden sm:inline">
                {me?.firstName ? me.firstName : me?.email}
              </span>
            </a>
            {/* Notification bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={openNotifPanel}
                className="relative rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                aria-label={t("notif.title")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-[400px] flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">{t("notif.title")}</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {t("notif.markAllRead")}
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-zinc-400 dark:text-slate-500 text-center">{t("notif.empty")}</p>
                    ) : (
                      notifications.slice(0, 20).map((notif) => (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={async () => {
                            if (!notif.read) await handleMarkRead(notif.id);
                            setNotifOpen(false);
                            if (notif.type === "task_assigned") {
                              window.location.href = "/todos";
                            } else if (notif.type === "team_invite") {
                              window.location.href = "/teams";
                            }
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-zinc-50 dark:border-slate-800 transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-800/60 ${
                            notif.read
                              ? "bg-white dark:bg-slate-900"
                              : "bg-blue-50/50 dark:bg-blue-950/20"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${notif.read ? "bg-transparent" : "bg-blue-500"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-800 dark:text-slate-200 truncate">{notif.message}</p>
                              <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-0.5">{timeAgo(notif.createdAt, t)}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={toggleDarkMode}
              className="rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("app.logout")}
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ── Sidebar ── */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-zinc-200 dark:border-slate-700 min-h-[calc(100vh-65px)] py-4 px-3 gap-1">
          {NAV_ITEMS.slice(0, 1).map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} />
          ))}
          {/* Tasks expandable section */}
          <div>
            <button
              type="button"
              onClick={() => setTasksOpen((v) => !v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                pathname.startsWith("/todos")
                  ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                  : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
              }`}
            >
              {TASKS_NAV.icon}
              <span className="flex-1 text-left">{t(TASKS_NAV.tKey)}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${tasksOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {tasksOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5">
                {TASKS_NAV.children.map((child) => (
                  <a
                    key={child.href}
                    href={child.href}
                    className={`block px-3 py-2 rounded text-sm transition-colors ${
                      pathname === child.href
                        ? "font-medium text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800/60"
                        : "text-zinc-500 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {t(child.tKey)}
                  </a>
                ))}
              </div>
            )}
          </div>
          {NAV_ITEMS.slice(1).map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} />
          ))}
          <hr className="border-zinc-200 dark:border-slate-700 my-2" />
          <NavLink href={SETTINGS_ITEM.href} icon={SETTINGS_ITEM.icon} label={t(SETTINGS_ITEM.tKey)} active={pathname === SETTINGS_ITEM.href} />
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 py-6 px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
