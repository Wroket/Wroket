"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  getMe,
  logout,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  acceptCollaboration,
  declineCollaboration,
  AuthMeResponse,
  AppNotification,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import TutorialModal, { useTutorial } from "@/components/TutorialModal";

interface AppShellProps {
  children: ReactNode;
}

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
    { tKey: "nav.archives" as TranslationKey, href: "/todos/archives" },
  ],
};

const AGENDA_ITEM = {
  tKey: "nav.agenda" as TranslationKey,
  href: "/agenda",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

const NOTIF_NAV_ITEM = {
  tKey: "nav.notifications" as TranslationKey,
  href: "/notifications",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
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

function NavLink({ href, icon, label, active, onClick }: { href: string; icon: ReactNode; label: string; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
          : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
      }`}
    >
      {icon}
      {label}
    </Link>
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

  const { showTutorial, openTutorial, closeTutorial } = useTutorial();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
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
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

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

  useEffect(() => {
    if (!helpMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (helpMenuRef.current && !helpMenuRef.current.contains(e.target as Node)) {
        setHelpMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [helpMenuOpen]);

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

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-2 focus:left-2 focus:rounded focus:bg-slate-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">
        Skip to main content
      </a>

      {/* ── Header ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-zinc-200 dark:border-slate-700 shadow-sm">
        <div className="px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden rounded p-1.5 text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
            <div className="w-10 h-10 rounded-xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center shrink-0">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                <path d="M2 13l4 4 4.5-6" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 13l4 4 4.5-6" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12.4 8l0.7-1" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" />
                <path d="M21.4 8l0.7-1" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold leading-tight">
              <span className="text-slate-800 dark:text-slate-100">Wro</span><span className="text-emerald-500 dark:text-emerald-400">ket</span>
            </h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link href="/settings" className="flex items-center gap-2 rounded px-1.5 sm:px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors">
              <div className="w-7 h-7 rounded-full bg-slate-700 dark:bg-slate-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {me?.firstName ? me.firstName.charAt(0).toUpperCase() : me?.email?.charAt(0).toUpperCase() ?? "?"}
                </span>
              </div>
              <span className="text-sm text-zinc-700 dark:text-slate-300 hidden sm:inline">
                {me?.firstName ? me.firstName : me?.email}
              </span>
            </Link>
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
                <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-sm bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-[400px] flex flex-col">
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
                    {notifications.filter((n) => !n.read).length === 0 ? (
                      <p className="px-4 py-6 text-sm text-zinc-400 dark:text-slate-500 text-center">{t("notif.empty")}</p>
                    ) : (
                      notifications.filter((n) => !n.read).slice(0, 20).map((notif) => (
                        <div
                          key={notif.id}
                          className="w-full text-left px-4 py-3 border-b border-zinc-50 dark:border-slate-800 bg-blue-50/50 dark:bg-blue-950/20"
                        >
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-blue-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-800 dark:text-slate-200 truncate">{notif.message}</p>
                              <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-0.5">{timeAgo(notif.createdAt, t)}</p>
                              {notif.type === "team_invite" && notif.data?.inviterEmail && (
                                <div className="flex gap-2 mt-2">
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await acceptCollaboration(notif.data!.inviterEmail);
                                        await handleMarkRead(notif.id);
                                        window.dispatchEvent(new Event("collaborators-updated"));
                                      } catch { /* ignore */ }
                                    }}
                                    className="rounded px-2.5 py-1 text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                  >
                                    {t("notif.accept" as TranslationKey)}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await declineCollaboration(notif.data!.inviterEmail);
                                        await handleMarkRead(notif.id);
                                        window.dispatchEvent(new Event("collaborators-updated"));
                                      } catch { /* ignore */ }
                                    }}
                                    className="rounded px-2.5 py-1 text-[11px] font-medium border border-zinc-300 dark:border-slate-600 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    {t("notif.decline" as TranslationKey)}
                                  </button>
                                </div>
                              )}
                              {notif.type !== "team_invite" && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await handleMarkRead(notif.id);
                                    setNotifOpen(false);
                                    if (notif.type === "task_assigned") window.location.href = "/todos";
                                  }}
                                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1"
                                >
                                  →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <Link
                    href="/notifications"
                    onClick={() => setNotifOpen(false)}
                    className="block text-center px-4 py-2.5 border-t border-zinc-100 dark:border-slate-800 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("notif.viewAll" as TranslationKey)}
                  </Link>
                </div>
              )}
            </div>
            <button
              onClick={toggleDarkMode}
              className="rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
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
            <div className="relative" ref={helpMenuRef}>
              <button
                onClick={() => setHelpMenuOpen((v) => !v)}
                className="rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                aria-label={t("tutorial.helpButton")}
                title={t("tutorial.helpButton")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              </button>
              {helpMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => { setHelpMenuOpen(false); openTutorial(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
                    </svg>
                    <div className="text-left">
                      <p className="font-medium">{t("help.tutorial")}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-slate-500">{t("help.tutorialDesc")}</p>
                    </div>
                  </button>
                  <hr className="border-zinc-100 dark:border-slate-700/50 my-1" />
                  <a
                    href="mailto:support@wroket.com"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <div className="text-left">
                      <p className="font-medium">{t("help.contact")}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-slate-500">support@wroket.com</p>
                    </div>
                  </a>
                </div>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="rounded border border-zinc-200 dark:border-slate-600 p-2 sm:px-4 sm:py-2 text-sm text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={t("app.logout")}
            >
              <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">{t("app.logout")}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile sidebar overlay ── */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden={!mobileMenuOpen}
      >
        <div className="absolute inset-0 bg-black/50" onClick={closeMobileMenu} />
        <nav
          aria-label="Main navigation"
          className={`absolute inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-zinc-200 dark:border-slate-700 py-4 px-3 flex flex-col gap-1 overflow-y-auto transition-transform duration-300 ease-in-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          {NAV_ITEMS.slice(0, 1).map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} onClick={closeMobileMenu} />
          ))}
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
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={closeMobileMenu}
                    className={`block px-3 py-2 rounded text-sm transition-colors ${
                      pathname === child.href
                        ? "font-medium text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800/60"
                        : "text-zinc-500 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {t(child.tKey)}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <NavLink href={AGENDA_ITEM.href} icon={AGENDA_ITEM.icon} label={t(AGENDA_ITEM.tKey)} active={pathname === "/agenda"} onClick={closeMobileMenu} />
          {NAV_ITEMS.slice(1).map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} onClick={closeMobileMenu} />
          ))}
          <NavLink href={NOTIF_NAV_ITEM.href} icon={NOTIF_NAV_ITEM.icon} label={t(NOTIF_NAV_ITEM.tKey)} active={pathname === "/notifications"} onClick={closeMobileMenu} />
          <hr className="border-zinc-200 dark:border-slate-700 my-2" />
          <NavLink href={SETTINGS_ITEM.href} icon={SETTINGS_ITEM.icon} label={t(SETTINGS_ITEM.tKey)} active={pathname === SETTINGS_ITEM.href} onClick={closeMobileMenu} />
        </nav>
      </div>

      <div className="flex">
        {/* ── Desktop Sidebar ── */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-zinc-200 dark:border-slate-700 min-h-[calc(100vh-65px)]">
          <nav aria-label="Main navigation" className="flex flex-col py-4 px-3 gap-1">
            {NAV_ITEMS.slice(0, 1).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} />
            ))}
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
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`block px-3 py-2 rounded text-sm transition-colors ${
                        pathname === child.href
                          ? "font-medium text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800/60"
                          : "text-zinc-500 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      {t(child.tKey)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <NavLink href={AGENDA_ITEM.href} icon={AGENDA_ITEM.icon} label={t(AGENDA_ITEM.tKey)} active={pathname === "/agenda"} />
            {NAV_ITEMS.slice(1).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} />
            ))}
            <NavLink href={NOTIF_NAV_ITEM.href} icon={NOTIF_NAV_ITEM.icon} label={t(NOTIF_NAV_ITEM.tKey)} active={pathname === "/notifications"} />
            <hr className="border-zinc-200 dark:border-slate-700 my-2" />
            <NavLink href={SETTINGS_ITEM.href} icon={SETTINGS_ITEM.icon} label={t(SETTINGS_ITEM.tKey)} active={pathname === SETTINGS_ITEM.href} />
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main id="main-content" role="main" className="flex-1 min-w-0 py-6 px-4 md:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <TutorialModal open={showTutorial} onClose={closeTutorial} />
    </div>
  );
}
