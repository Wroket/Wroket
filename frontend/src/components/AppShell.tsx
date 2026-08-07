"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  logout,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  acceptCollaboration,
  declineCollaboration,
  shareInviteApi,
  globalSearch,
  getEmailSuggestions,
  AppNotification,
  SearchResult,
} from "@/lib/api";
import { WroketLockup } from "@/components/brand/WroketBrand";
import ContactEmailSuggestInput from "@/components/ContactEmailSuggestInput";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import TutorialModal, { useTutorial } from "@/components/TutorialModal";
import EarlyBirdBadge from "@/components/EarlyBirdBadge";
import FeedbackModal from "@/components/FeedbackModal";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/components/AuthContext";
import FreeQuotaBanner from "@/components/FreeQuotaBanner";
import { notificationOpenHref } from "@/lib/notificationDeepLink";
import { PUSH_NOTIFICATION_ICON } from "@/lib/pushBranding";
import { hasLocalWebPushSubscription } from "@/lib/webPushLocal";
import { useUiV2 } from "@/lib/UiVersionContext";
import CommandPalette from "@/components/v2/CommandPalette";
import CreateMenu from "@/components/v2/CreateMenu";

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
];

const TEAMS_NAV = {
  tKey: "nav.teams",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  children: [
    { tKey: "nav.myTeams", href: "/teams" },
    { tKey: "teamDash.title", href: "/teams/dashboard" },
  ],
};

const ARCHIVE_NAV = {
  tKey: "nav.archive",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  children: [
    { tKey: "nav.archiveTasks", href: "/archive/tasks" },
    { tKey: "nav.archiveProjects", href: "/archive/projects" },
    { tKey: "nav.archiveTeams", href: "/archive/teams" },
    { tKey: "nav.archiveData", href: "/archive/data" },
  ],
};

const TASKS_NAV = {
  tKey: "nav.tasks",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  children: [
    { tKey: "nav.myTasks", href: "/todos" },
    { tKey: "nav.delegated", href: "/todos/delegated" },
  ],
};

const AGENDA_NAV = {
  tKey: "nav.agenda",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  children: [
    { tKey: "nav.myAgenda", href: "/agenda" },
    { tKey: "nav.manageCalendars", href: "/agenda/manage" },
  ],
};

const NOTES_ITEM = {
  tKey: "nav.notes",
  href: "/notes",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
};

const NOTIF_NAV_ITEM = {
  tKey: "nav.notifications",
  href: "/notifications",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
};

const SETTINGS_ITEM = {
  tKey: "nav.settings",
  href: "/settings",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const DOCS_ITEM = {
  tKey: "nav.documentation",
  href: "/docs",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
};

const FEEDBACK_ITEM = {
  tKey: "nav.feedback",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
};

function isDocsPath(pathname: string): boolean {
  return pathname === "/docs" || pathname.startsWith("/docs/");
}

const ADMIN_ITEM = {
  tKey: "nav.admin",
  href: "/admin",
  icon: (
    <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

/** Used only when GET /auth/me has no `isAdmin` yet (older API). Must stay aligned with Cloud Run `ADMIN_EMAILS`. */
const LEGACY_ADMIN_EMAIL_ALLOWLIST = ["francois@broudeur.com", "team@wroket.com"];

function userSeesAdminNav(me: { email: string; isAdmin?: boolean }): boolean {
  if (me.isAdmin === true) return true;
  if (me.isAdmin === false) return false;
  return LEGACY_ADMIN_EMAIL_ALLOWLIST.includes(me.email.toLowerCase());
}

function NavLink({
  href,
  icon,
  label,
  active,
  onClick,
  collapsed,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
  /** V2 icon rail: hide label, show native tooltip. */
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`flex items-center rounded text-sm font-medium transition-colors ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      } ${
        active
          ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
          : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
      }`}
    >
      {icon}
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </Link>
  );
}

function NavButton({
  icon,
  label,
  onClick,
  collapsed,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`w-full flex items-center rounded text-sm font-medium transition-colors text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100 ${
        collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
      }`}
    >
      {icon}
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </button>
  );
}

/** Icon-rail flyout for nested nav groups when the V2 sidebar is collapsed. */
function CollapsedNavGroup({
  icon,
  label,
  active,
  open,
  onOpenChange,
  children,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      // Flush to the rail (no gap) so the pointer never falls into dead space.
      setMenuPos({ top: r.top, left: r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onOpenChange]);

  const menu =
    open && menuPos && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left }}
            /* Portal to body — sticky aside traps stacking vs Agenda main. */
            className="fixed z-[200] min-w-[11rem] pl-1.5 pointer-events-auto"
          >
            <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-xl">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                {label}
              </p>
              {children}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        /* Native title tooltips sit above the flyout and steal hover — only when closed. */
        title={open ? undefined : label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={`w-full flex items-center justify-center px-2 py-2.5 rounded text-sm font-medium transition-colors ${
          active
            ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
            : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
        }`}
      >
        {icon}
      </button>
      {menu}
    </div>
  );
}

function flyoutChildClass(active: boolean): string {
  return `block mx-1 px-2.5 py-2 rounded text-sm transition-colors ${
    active
      ? "font-medium text-zinc-900 dark:text-slate-100 bg-zinc-100 dark:bg-slate-800 hover:bg-zinc-200/80 dark:hover:bg-slate-700"
      : "text-zinc-600 dark:text-slate-300 hover:text-zinc-900 dark:hover:text-slate-100 hover:bg-zinc-100 dark:hover:bg-slate-800"
  }`;
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

function panelNotifHref(notif: AppNotification): string | null {
  if (notif.type === "note_mention" && notif.data?.noteAccessible === "false") return null;
  return notificationOpenHref(notif);
}

function isPathAllowedForWorkspaceAdmin(pathname: string): boolean {
  return (
    pathname.startsWith("/teams") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/docs")
  );
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { toast } = useToast();
  const { user: me, loading, refresh } = useAuth();
  const { uiV2, setUiV2, sidebarCollapsed, toggleSidebarCollapsed } = useUiV2();
  const wsAdminOnly = me?.isWorkspaceAdminOnly === true;
  const wsDefaultTeamId = me?.workspaceAdminTeamIds?.[0];
  const [darkMode, setDarkMode] = useState(false);

  const { showTutorial, openTutorial, closeTutorial } = useTutorial();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [sidebarFlyout, setSidebarFlyout] = useState<"tasks" | "agenda" | "teams" | "archive" | null>(null);
  /** Enable width animation only after an explicit toggle (not on AppShell remount). */
  const [sidebarWidthTransition, setSidebarWidthTransition] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifTimeTick, setNotifTimeTick] = useState(0);
  const prevUnreadCountRef = useRef(0);
  const browserNotifPermRef = useRef<NotificationPermission | null>(null);
  const panelNotifications = useMemo(
    () =>
      [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20),
    // notifTimeTick: periodic refresh so relative times in the panel stay current
    [notifications, notifTimeTick], // eslint-disable-line react-hooks/exhaustive-deps -- tick intentionally busts memo
  );
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
    setSidebarFlyout(null);
  }, [pathname]);

  useEffect(() => {
    if (!uiV2) setSidebarFlyout(null);
  }, [uiV2]);

  const railCollapsed = uiV2 && sidebarCollapsed;

  const onToggleSidebarCollapsed = useCallback(() => {
    setSidebarWidthTransition(true);
    toggleSidebarCollapsed();
    setSidebarFlyout(null);
  }, [toggleSidebarCollapsed]);

  const setFlyout = useCallback((id: "tasks" | "agenda" | "teams" | "archive" | null) => {
    setSidebarFlyout(id);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/todos")) setTasksOpen(true);
    if (pathname.startsWith("/agenda")) setAgendaOpen(true);
    if (pathname.startsWith("/teams")) setTeamsOpen(true);
    if (pathname.startsWith("/archive")) setArchiveOpen(true);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (loading || !wsAdminOnly) return;
    if (isPathAllowedForWorkspaceAdmin(pathname)) return;
    const q = wsDefaultTeamId ? `?team=${encodeURIComponent(wsDefaultTeamId)}` : "";
    router.replace(`/teams/dashboard${q}`);
  }, [loading, wsAdminOnly, pathname, router, wsDefaultTeamId]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);

  useEffect(() => {
    // Initialise permission state (no prompt here).
    if (typeof Notification !== "undefined") {
      browserNotifPermRef.current = Notification.permission;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const c = await getUnreadCount();
        if (!cancelled) {
          const prev = prevUnreadCountRef.current;
          prevUnreadCountRef.current = c;
          // Desktop alert when tab is open — skip if Web Push handles this device.
          if (c > prev && typeof Notification !== "undefined" && Notification.permission === "granted") {
            void (async () => {
              if (await hasLocalWebPushSubscription()) return;
              try {
                const list = await getNotifications();
                const latest = list.find((n) => !n.read) ?? list[0];
                if (latest) {
                  const href = panelNotifHref(latest);
                  const desktopNotif = new Notification(latest.title || "Wroket", {
                    body: latest.message,
                    icon: PUSH_NOTIFICATION_ICON,
                    tag: latest.id ? `wroket-${latest.id}` : "wroket-notif",
                  });
                  desktopNotif.onclick = () => {
                    window.focus();
                    if (href) window.location.href = href;
                    desktopNotif.close();
                  };
                  return;
                }
              } catch { /* fall through to generic */ }
              const delta = c - prev;
              const body = delta === 1
                ? "Vous avez 1 nouvelle notification"
                : `Vous avez ${delta} nouvelles notifications`;
              try {
                new Notification("Wroket", { body, icon: PUSH_NOTIFICATION_ICON, tag: "wroket-notif" });
              } catch { /* browser may block even with permission */ }
            })();
          }
          setUnreadCount(c);
        }
      } catch { /* polling — silent */ }
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
    if (!notifOpen) return;
    const id = window.setInterval(() => setNotifTimeTick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
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

  const refreshNotificationList = useCallback(async () => {
    try {
      const list = await getNotifications();
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch {
      toast.error(t("toast.loadError"));
    }
  }, [toast, t]);

  const openNotifPanel = useCallback(() => {
    setNotifOpen((prev) => {
      if (!prev) void refreshNotificationList();
      return !prev;
    });
  }, [refreshNotificationList]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { toast.error(t("toast.updateError")); }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { toast.error(t("toast.updateError")); }
  };

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchContactEmails, setSearchContactEmails] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSearchOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [searchOpen]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.length < 2) {
      setSearchResults([]);
      setSearchContactEmails([]);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      try {
        const q = value.trim();
        const [results, contacts] = await Promise.all([
          globalSearch(value, { signal: ac.signal }),
          q.length >= 3 ? getEmailSuggestions(q, { signal: ac.signal }) : Promise.resolve([] as string[]),
        ]);
        setSearchResults(results);
        setSearchContactEmails(contacts);
        setSearchOpen(true);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSearchResults([]);
        setSearchContactEmails([]);
        toast.error(t("toast.loadError"));
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [t, toast]);

  const copyContactEmail = useCallback(
    async (email: string) => {
      try {
        await navigator.clipboard.writeText(email);
        toast.success(t("search.contactCopied"));
      } catch {
        toast.error(t("toast.genericError"));
      }
    },
    [t, toast],
  );

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setMobileSearchOpen(false);
    if (result.type === "todo") router.push(`/todos?edit=${encodeURIComponent(result.id)}`);
    else if (result.type === "project") router.push(`/projects/${encodeURIComponent(result.id)}`);
    else if (result.type === "note") router.push(`/notes?id=${encodeURIComponent(result.id)}`);
    else if (result.type === "contact") router.push("/teams?section=contacts");
    else if (result.type === "database") router.push(`/notes?section=databases&db=${encodeURIComponent(result.id)}`);
  }, [router]);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [shareResult, setShareResult] = useState<"success" | "error" | null>(null);
  const shareCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareCloseTimerRef.current) clearTimeout(shareCloseTimerRef.current);
    };
  }, []);

  const handleShareInvite = async () => {
    if (!shareEmail.includes("@")) return;
    setShareSending(true);
    setShareResult(null);
    try {
      await shareInviteApi(shareEmail);
      setShareResult("success");
      setShareEmail("");
      if (shareCloseTimerRef.current) clearTimeout(shareCloseTimerRef.current);
      shareCloseTimerRef.current = setTimeout(() => { setShareOpen(false); setShareResult(null); }, 2000);
    } catch {
      setShareResult("error");
    } finally {
      setShareSending(false);
    }
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
    <div className={`min-h-screen flex flex-col transition-colors [--app-mobile-header:4.5rem] ${
      uiV2
        ? "ui-v2 ui-v2-shell"
        : "bg-zinc-100 dark:bg-slate-950"
    }`}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-2 focus:left-2 focus:rounded focus:bg-slate-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">
        {t("a11y.skipToContent")}
      </a>

      {/* ── Header ── */}
      <header className={`sticky top-0 z-50 shrink-0 border-b shadow-sm ${
        uiV2
          ? "ui-glass"
          : "bg-white dark:bg-slate-900 border-zinc-200 dark:border-slate-700"
      }`}>
        <div className="px-4 md:px-6 py-4 flex items-center justify-between min-h-[var(--app-mobile-header)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden rounded p-1.5 text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={mobileMenuOpen ? t("a11y.closeMenu") : t("a11y.openMenu")}
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
            <WroketLockup
              theme="auto"
              markSize={28}
              markContainerClassName="wroket-mark-tile w-10 h-10 bg-slate-800 dark:bg-slate-100 flex items-center justify-center shrink-0"
              wordmarkClassName="text-lg font-semibold"
            />
            {me?.earlyBird ? (
              <>
                <EarlyBirdBadge className="hidden sm:inline-flex" />
                <EarlyBirdBadge compact className="sm:hidden" />
              </>
            ) : null}
            <button
              type="button"
              role="switch"
              data-testid="ui-v2-toggle"
              aria-checked={uiV2}
              aria-label={t("settings.uiV2")}
              title={uiV2 ? t("settings.uiV2On") : t("settings.uiV2Off")}
              onClick={() => setUiV2(!uiV2)}
              className={`hidden sm:inline-flex items-center gap-2 rounded-full border px-2 py-1 transition-colors ${
                uiV2
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/60"
              }`}
            >
              <span
                className={`relative shrink-0 w-8 h-4 rounded-full transition-colors ${
                  uiV2 ? "bg-emerald-600 dark:bg-emerald-500" : "bg-zinc-300 dark:bg-slate-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                    uiV2 ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
              <span
                className={`text-[10px] font-semibold whitespace-nowrap ${
                  uiV2
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-zinc-500 dark:text-slate-400"
                }`}
              >
                {t("uiV2.newInterface")}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            {uiV2 && !wsAdminOnly && <CreateMenu />}
            {/* Mobile search button */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              className="sm:hidden rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={t("search.placeholder")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            {/* Desktop search bar */}
            <div className="relative hidden sm:block" ref={searchRef}>
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0 || searchContactEmails.length > 0) setSearchOpen(true); }}
                  placeholder={t("search.placeholder")}
                  className="w-48 lg:w-64 rounded-lg border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 transition-colors"
                />
                {searchLoading && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zinc-300 dark:border-slate-500 border-t-emerald-500 rounded-full animate-spin" />
                )}
              </div>
              {searchOpen && (
                <div className={`absolute left-0 top-full mt-1.5 w-80 max-h-[400px] overflow-y-auto bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl z-50 ${uiV2 ? "rounded-sm" : "rounded-lg"}`}>
                  {searchResults.length === 0 && searchContactEmails.length === 0 && searchQuery.length >= 2 ? (
                    <p className="px-4 py-6 text-sm text-zinc-400 dark:text-slate-500 text-center">{t("search.noResults")}</p>
                  ) : (
                    <>
                      {searchContactEmails.length > 0 && searchQuery.trim().length >= 3 && (
                        <div>
                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-slate-500 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-100 dark:border-slate-800">
                            {t("search.contacts")}
                          </div>
                          {searchContactEmails.map((email) => (
                            <button
                              key={email}
                              type="button"
                              onClick={() => void copyContactEmail(email)}
                              className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors border-b border-zinc-50 dark:border-slate-800/50"
                            >
                              <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{email}</p>
                              <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-0.5">{t("search.contactCopyHint")}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {(["todo", "project", "note", "contact", "database"] as const).map((type) => {
                        const group = searchResults.filter((r) => r.type === type);
                        if (group.length === 0) return null;
                        const labelKey =
                          type === "todo" ? "search.todos"
                          : type === "project" ? "search.projects"
                          : type === "note" ? "search.notes"
                          : type === "contact" ? "search.contactsRepertoire"
                          : "search.databases";
                        const icon =
                          type === "todo" ? "\u{1F4CB}"
                          : type === "project" ? "\u{1F4C1}"
                          : type === "note" ? "\u{1F4DD}"
                          : type === "contact" ? "\u{1F464}"
                          : "\u{1F4CA}";
                        return (
                          <div key={type}>
                            <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-slate-500 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-100 dark:border-slate-800">
                              {icon} {t(labelKey)}
                            </div>
                            {group.map((result) => (
                              <button
                                key={`${result.type}-${result.id}`}
                                type="button"
                                onClick={() => handleSearchResultClick(result)}
                                className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors border-b border-zinc-50 dark:border-slate-800/50 last:border-b-0"
                              >
                                <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{result.title}</p>
                                {result.snippet && (
                                  <p className="text-xs text-zinc-400 dark:text-slate-500 truncate mt-0.5">{result.snippet}</p>
                                )}
                                {result.status && (
                                  <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-slate-700 text-zinc-500 dark:text-slate-400">{result.status}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
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
                <div className={`absolute right-0 top-full mt-2 w-[min(calc(100vw-1.5rem),26rem)] sm:w-[26rem] bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl z-50 max-h-[min(70vh,32rem)] flex flex-col ${uiV2 ? "rounded-sm" : "rounded-lg"}`}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">{t("notif.title")}</h3>
                    <div className="flex items-center gap-2">
                      {typeof Notification !== "undefined" && Notification.permission === "default" && (
                        <Link
                          href="/settings?tab=integrations"
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
                          title={t("notif.enableSystemPushTitle")}
                        >
                          {t("notif.enableSystemPush")}
                        </Link>
                      )}
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
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {panelNotifications.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-zinc-400 dark:text-slate-500 text-center">{t("notif.empty")}</p>
                    ) : (
                      panelNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`w-full text-left px-3 py-2.5 border-b border-zinc-50 dark:border-slate-800 ${
                            notif.read
                              ? "bg-white dark:bg-slate-900/80"
                              : "bg-blue-50/50 dark:bg-blue-950/20"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`w-2 h-2 rounded-full mt-2 shrink-0 ${notif.read ? "bg-zinc-300 dark:bg-slate-600" : "bg-blue-500"}`}
                              aria-hidden
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                              <p
                                className={`text-sm leading-snug break-words line-clamp-5 ${
                                  notif.read ? "text-zinc-600 dark:text-slate-400" : "text-zinc-800 dark:text-slate-200 font-medium"
                                }`}
                              >
                                {notif.message}
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                <span className="text-[10px] text-zinc-400 dark:text-slate-500 tabular-nums">
                                  {timeAgo(notif.createdAt, t)}
                                </span>
                                {notif.type !== "team_invite" && (() => {
                                  const href = panelNotifHref(notif);
                                  if (!href) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await handleMarkRead(notif.id);
                                        setNotifOpen(false);
                                        router.push(href);
                                      }}
                                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                                    >
                                      {t("notif.open")}
                                    </button>
                                  );
                                })()}
                              </div>
                              {notif.type === "team_invite" && notif.data?.inviterEmail && (
                                <div className="flex flex-wrap gap-2 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await acceptCollaboration(notif.data!.inviterEmail);
                                        await handleMarkRead(notif.id);
                                        window.dispatchEvent(new Event("collaborators-updated"));
                                      } catch { toast.error(t("toast.acceptError")); }
                                    }}
                                    className="rounded px-2.5 py-1 text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                  >
                                    {t("notif.accept")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await declineCollaboration(notif.data!.inviterEmail);
                                        await handleMarkRead(notif.id);
                                        window.dispatchEvent(new Event("collaborators-updated"));
                                      } catch { toast.error(t("toast.declineError")); }
                                    }}
                                    className="rounded px-2.5 py-1 text-[11px] font-medium border border-zinc-300 dark:border-slate-600 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    {t("notif.decline")}
                                  </button>
                                </div>
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
                    {t("notif.viewAll")}
                  </Link>
                </div>
              )}
            </div>
            <button
              onClick={toggleDarkMode}
              className="rounded border border-zinc-200 dark:border-slate-600 p-2 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              aria-label={darkMode ? t("a11y.toggleDarkMode") : t("a11y.toggleLightMode")}
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
                  <Link
                    href="/docs"
                    onClick={() => setHelpMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <div className="text-left">
                      <p className="font-medium">{t("help.documentation")}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-slate-500">{t("help.documentationDesc")}</p>
                    </div>
                  </Link>
                  <hr className="border-zinc-100 dark:border-slate-700/50 my-1" />
                  <a
                    href="mailto:team@wroket.com"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                    <div className="text-left">
                      <p className="font-medium">{t("help.contact")}</p>
                      <p className="text-[11px] text-zinc-400 dark:text-slate-500">team@wroket.com</p>
                    </div>
                  </a>
                </div>
              )}
            </div>
            <button
              onClick={() => { setShareOpen(true); setShareResult(null); }}
              className="inline-flex items-center justify-center gap-2 rounded bg-slate-700 dark:bg-slate-600 p-2 sm:px-4 sm:py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 transition-colors"
              aria-label={t("app.share")}
            >
              <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span className="hidden sm:inline">{t("app.share")}</span>
            </button>
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
          aria-label={t("a11y.mainNavigation")}
          className={`absolute left-0 bottom-0 top-[var(--app-mobile-header)] w-64 border-r flex flex-col min-h-0 overflow-hidden transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          } ${
            uiV2
              ? "ui-v2-sidebar"
              : "bg-white dark:bg-slate-900 border-zinc-200 dark:border-slate-700"
          }`}
        >
          <div className="flex-1 min-h-0 overflow-y-auto py-3 px-3 flex flex-col gap-1">
            {!wsAdminOnly && NAV_ITEMS.slice(0, 1).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} onClick={closeMobileMenu} />
            ))}
            {!wsAdminOnly && (
            <>
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
          <div>
            <button
              type="button"
              onClick={() => setAgendaOpen((v) => !v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                pathname.startsWith("/agenda")
                  ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                  : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
              }`}
            >
              {AGENDA_NAV.icon}
              <span className="flex-1 text-left">{t(AGENDA_NAV.tKey)}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${agendaOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {agendaOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5">
                {AGENDA_NAV.children.map((child) => (
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
          <NavLink href={NOTES_ITEM.href} icon={NOTES_ITEM.icon} label={t(NOTES_ITEM.tKey)} active={pathname === "/notes"} onClick={closeMobileMenu} />
          {NAV_ITEMS.slice(1).map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} onClick={closeMobileMenu} />
          ))}
            </>
            )}
          <div>
            <button
              type="button"
              onClick={() => setTeamsOpen((v) => !v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                pathname.startsWith("/teams")
                  ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                  : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
              }`}
            >
              {TEAMS_NAV.icon}
              <span className="flex-1 text-left">{t(TEAMS_NAV.tKey)}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${teamsOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {teamsOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5">
                {TEAMS_NAV.children.map((child) => (
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
          <NavLink href={NOTIF_NAV_ITEM.href} icon={NOTIF_NAV_ITEM.icon} label={t(NOTIF_NAV_ITEM.tKey)} active={pathname === "/notifications"} onClick={closeMobileMenu} />
          {!wsAdminOnly && (
          <div>
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                pathname.startsWith("/archive")
                  ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                  : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
              }`}
            >
              {ARCHIVE_NAV.icon}
              <span className="flex-1 text-left">{t(ARCHIVE_NAV.tKey)}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${archiveOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {archiveOpen && (
              <div className="ml-7 mt-0.5 space-y-0.5">
                {ARCHIVE_NAV.children.map((child) => {
                  const active =
                    child.href === "/archive/data"
                      ? pathname.startsWith("/archive/data")
                      : pathname === child.href;
                  return (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={closeMobileMenu}
                    className={`block px-3 py-2 rounded text-sm transition-colors ${
                      active
                        ? "font-medium text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800/60"
                        : "text-zinc-500 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800/60"
                    }`}
                  >
                    {t(child.tKey)}
                  </Link>
                  );
                })}
              </div>
            )}
          </div>
          )}
          </div>
          <div className="shrink-0 border-t border-zinc-200 dark:border-slate-700 py-3 px-3 flex flex-col gap-1">
            {me && (
              <NavButton
                icon={FEEDBACK_ITEM.icon}
                label={t(FEEDBACK_ITEM.tKey)}
                onClick={() => { closeMobileMenu(); setFeedbackOpen(true); }}
              />
            )}
            <NavLink href={DOCS_ITEM.href} icon={DOCS_ITEM.icon} label={t(DOCS_ITEM.tKey)} active={isDocsPath(pathname)} onClick={closeMobileMenu} />
            <NavLink href={SETTINGS_ITEM.href} icon={SETTINGS_ITEM.icon} label={t(SETTINGS_ITEM.tKey)} active={pathname === SETTINGS_ITEM.href} onClick={closeMobileMenu} />
            {me && userSeesAdminNav(me) && (
              <NavLink href={ADMIN_ITEM.href} icon={ADMIN_ITEM.icon} label={t(ADMIN_ITEM.tKey)} active={pathname === ADMIN_ITEM.href} onClick={closeMobileMenu} />
            )}
          </div>
        </nav>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Desktop Sidebar: full viewport height below header; main nav scrolls; settings pinned at bottom -- */}
        <aside
          className={`hidden md:flex md:flex-col md:shrink-0 md:sticky md:top-[4.5rem] md:h-[calc(100vh-4.5rem)] md:min-h-0 border-r ${
            sidebarWidthTransition ? "transition-[width] duration-200 ease-out" : ""
          } ${railCollapsed ? "md:w-16" : "md:w-56"} ${
            uiV2
              ? "ui-v2-sidebar"
              : "bg-white dark:bg-slate-900 border-zinc-200 dark:border-slate-700"
          }`}
        >
          <nav aria-label={t("a11y.mainNavigation")} className="flex flex-col flex-1 min-h-0">
            <div className={`flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-1 ${railCollapsed ? "px-2" : "px-3"}`}>
            {!wsAdminOnly && NAV_ITEMS.slice(0, 1).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} collapsed={railCollapsed} />
            ))}
            {!wsAdminOnly && (
            <>
            {railCollapsed ? (
              <CollapsedNavGroup
                icon={TASKS_NAV.icon}
                label={t(TASKS_NAV.tKey)}
                active={pathname.startsWith("/todos")}
                open={sidebarFlyout === "tasks"}
                onOpenChange={(open) => setFlyout(open ? "tasks" : null)}
              >
                {TASKS_NAV.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    role="menuitem"
                    onClick={() => setFlyout(null)}
                    className={flyoutChildClass(pathname === child.href)}
                  >
                    {t(child.tKey)}
                  </Link>
                ))}
              </CollapsedNavGroup>
            ) : (
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
            )}
            {railCollapsed ? (
              <CollapsedNavGroup
                icon={AGENDA_NAV.icon}
                label={t(AGENDA_NAV.tKey)}
                active={pathname.startsWith("/agenda")}
                open={sidebarFlyout === "agenda"}
                onOpenChange={(open) => setFlyout(open ? "agenda" : null)}
              >
                {AGENDA_NAV.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    role="menuitem"
                    onClick={() => setFlyout(null)}
                    className={flyoutChildClass(pathname === child.href)}
                  >
                    {t(child.tKey)}
                  </Link>
                ))}
              </CollapsedNavGroup>
            ) : (
            <div>
              <button
                type="button"
                onClick={() => setAgendaOpen((v) => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  pathname.startsWith("/agenda")
                    ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                    : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
                }`}
              >
                {AGENDA_NAV.icon}
                <span className="flex-1 text-left">{t(AGENDA_NAV.tKey)}</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${agendaOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {agendaOpen && (
                <div className="ml-7 mt-0.5 space-y-0.5">
                  {AGENDA_NAV.children.map((child) => (
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
            )}
            <NavLink href={NOTES_ITEM.href} icon={NOTES_ITEM.icon} label={t(NOTES_ITEM.tKey)} active={pathname === "/notes"} collapsed={railCollapsed} />
            {NAV_ITEMS.slice(1).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} label={t(item.tKey)} active={pathname === item.href} collapsed={railCollapsed} />
            ))}
            </>
            )}
            {railCollapsed ? (
              <CollapsedNavGroup
                icon={TEAMS_NAV.icon}
                label={t(TEAMS_NAV.tKey)}
                active={pathname.startsWith("/teams")}
                open={sidebarFlyout === "teams"}
                onOpenChange={(open) => setFlyout(open ? "teams" : null)}
              >
                {TEAMS_NAV.children.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    role="menuitem"
                    onClick={() => setFlyout(null)}
                    className={flyoutChildClass(pathname === child.href)}
                  >
                    {t(child.tKey)}
                  </Link>
                ))}
              </CollapsedNavGroup>
            ) : (
            <div>
              <button
                type="button"
                onClick={() => setTeamsOpen((v) => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  pathname.startsWith("/teams")
                    ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                    : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
                }`}
              >
                {TEAMS_NAV.icon}
                <span className="flex-1 text-left">{t(TEAMS_NAV.tKey)}</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${teamsOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {teamsOpen && (
                <div className="ml-7 mt-0.5 space-y-0.5">
                  {TEAMS_NAV.children.map((child) => (
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
            )}
            <NavLink href={NOTIF_NAV_ITEM.href} icon={NOTIF_NAV_ITEM.icon} label={t(NOTIF_NAV_ITEM.tKey)} active={pathname === "/notifications"} collapsed={railCollapsed} />
            {!wsAdminOnly && (
            railCollapsed ? (
              <CollapsedNavGroup
                icon={ARCHIVE_NAV.icon}
                label={t(ARCHIVE_NAV.tKey)}
                active={pathname.startsWith("/archive")}
                open={sidebarFlyout === "archive"}
                onOpenChange={(open) => setFlyout(open ? "archive" : null)}
              >
                {ARCHIVE_NAV.children.map((child) => {
                  const active =
                    child.href === "/archive/data"
                      ? pathname.startsWith("/archive/data")
                      : pathname === child.href;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      role="menuitem"
                      onClick={() => setFlyout(null)}
                      className={flyoutChildClass(active)}
                    >
                      {t(child.tKey)}
                    </Link>
                  );
                })}
              </CollapsedNavGroup>
            ) : (
            <div>
              <button
                type="button"
                onClick={() => setArchiveOpen((v) => !v)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  pathname.startsWith("/archive")
                    ? "bg-zinc-100 dark:bg-slate-800 text-zinc-900 dark:text-slate-100"
                    : "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100"
                }`}
              >
                {ARCHIVE_NAV.icon}
                <span className="flex-1 text-left">{t(ARCHIVE_NAV.tKey)}</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${archiveOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {archiveOpen && (
                <div className="ml-7 mt-0.5 space-y-0.5">
                  {ARCHIVE_NAV.children.map((child) => {
                    const active =
                      child.href === "/archive/data"
                        ? pathname.startsWith("/archive/data")
                        : pathname === child.href;
                    return (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={`block px-3 py-2 rounded text-sm transition-colors ${
                        active
                          ? "font-medium text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800/60"
                          : "text-zinc-500 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      {t(child.tKey)}
                    </Link>
                    );
                  })}
                </div>
              )}
            </div>
            )
            )}
            </div>
            <div className={`shrink-0 border-t border-zinc-200 dark:border-slate-700 py-3 flex flex-col gap-1 ${railCollapsed ? "px-2" : "px-3"}`}>
              {me && (
                <NavButton
                  icon={FEEDBACK_ITEM.icon}
                  label={t(FEEDBACK_ITEM.tKey)}
                  onClick={() => setFeedbackOpen(true)}
                  collapsed={railCollapsed}
                />
              )}
              <NavLink href={DOCS_ITEM.href} icon={DOCS_ITEM.icon} label={t(DOCS_ITEM.tKey)} active={isDocsPath(pathname)} collapsed={railCollapsed} />
              <NavLink href={SETTINGS_ITEM.href} icon={SETTINGS_ITEM.icon} label={t(SETTINGS_ITEM.tKey)} active={pathname === SETTINGS_ITEM.href} collapsed={railCollapsed} />
              {me && userSeesAdminNav(me) && (
                <NavLink href={ADMIN_ITEM.href} icon={ADMIN_ITEM.icon} label={t(ADMIN_ITEM.tKey)} active={pathname === ADMIN_ITEM.href} collapsed={railCollapsed} />
              )}
              {uiV2 && (
                <button
                  type="button"
                  onClick={onToggleSidebarCollapsed}
                  title={railCollapsed ? t("a11y.expandSidebar") : t("a11y.collapseSidebar")}
                  aria-label={railCollapsed ? t("a11y.expandSidebar") : t("a11y.collapseSidebar")}
                  aria-expanded={!railCollapsed}
                  className={`mt-1 w-full flex items-center rounded text-sm font-medium transition-colors text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100 ${
                    railCollapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
                  }`}
                >
                  <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                    {railCollapsed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                    )}
                  </svg>
                  {!railCollapsed && (
                    <span className="flex-1 text-left">{t("a11y.collapseSidebar")}</span>
                  )}
                </button>
              )}
            </div>
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main id="main-content" role="main" className="flex-1 min-w-0 py-6 px-4 md:px-6 lg:px-8">
          {me ? <FreeQuotaBanner /> : null}
          {children}
        </main>
      </div>

      <TutorialModal
        open={showTutorial}
        onClose={closeTutorial}
        earlyBird={!!me?.earlyBird}
        onEarlyBirdEnrolled={refresh}
      />

      {me && (
        <FeedbackModal
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          user={{ firstName: me.firstName, lastName: me.lastName, email: me.email }}
        />
      )}

      {mobileSearchOpen && (
        <div className="fixed inset-0 z-[110] bg-white dark:bg-slate-950 flex flex-col sm:hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => { setMobileSearchOpen(false); setSearchQuery(""); setSearchResults([]); setSearchContactEmails([]); }}
              className="rounded p-1.5 text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800"
              aria-label={t("edit.cancel")}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="relative flex-1">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t("search.placeholder")}
                className="w-full rounded-lg border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 pl-8 pr-3 py-2 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 dark:placeholder:text-slate-500 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {searchResults.length === 0 && searchContactEmails.length === 0 && searchQuery.length >= 2 ? (
              <p className="px-4 py-8 text-sm text-zinc-400 dark:text-slate-500 text-center">{t("search.noResults")}</p>
            ) : (
              <>
                {searchContactEmails.length > 0 && searchQuery.trim().length >= 3 && (
                  <div>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-slate-500 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-100 dark:border-slate-800">
                      {t("search.contacts")}
                    </div>
                    {searchContactEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => void copyContactEmail(email)}
                        className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-slate-800 border-b border-zinc-50 dark:border-slate-800/50"
                      >
                        <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{email}</p>
                        <p className="text-xs text-zinc-400 dark:text-slate-500 mt-0.5">{t("search.contactCopyHint")}</p>
                      </button>
                    ))}
                  </div>
                )}
                {(["todo", "project", "note", "contact", "database"] as const).map((type) => {
                  const group = searchResults.filter((r) => r.type === type);
                  if (group.length === 0) return null;
                  const labelKey =
                    type === "todo" ? "search.todos"
                    : type === "project" ? "search.projects"
                    : type === "note" ? "search.notes"
                    : type === "contact" ? "search.contactsRepertoire"
                    : "search.databases";
                  return (
                    <div key={type}>
                      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-slate-500 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-100 dark:border-slate-800">
                        {t(labelKey)}
                      </div>
                      {group.map((result) => (
                        <button
                          key={`${result.type}-${result.id}`}
                          type="button"
                          onClick={() => handleSearchResultClick(result)}
                          className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-slate-800 border-b border-zinc-50 dark:border-slate-800/50"
                        >
                          <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{result.title}</p>
                          {result.snippet && <p className="text-xs text-zinc-400 dark:text-slate-500 truncate mt-0.5">{result.snippet}</p>}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={() => setShareOpen(false)} onKeyDown={(e) => { if (e.key === "Escape") setShareOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="share-dialog-title" className={`bg-white dark:bg-slate-900 shadow-xl border border-zinc-200 dark:border-slate-700 w-full max-w-sm mx-4 p-6 ${uiV2 ? "rounded-sm" : "rounded-2xl"}`} onClick={(e) => e.stopPropagation()}>
            <h3 id="share-dialog-title" className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-1">{t("app.share")}</h3>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mb-4">{t("app.share.placeholder")}</p>
            <ContactEmailSuggestInput
              autoFocus
              value={shareEmail}
              onChange={setShareEmail}
              onKeyDown={(e) => { if (e.key === "Enter") handleShareInvite(); }}
              placeholder={t("app.shareEmailExample")}
              inputClassName="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 placeholder:text-zinc-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400"
            />
            {shareResult === "success" && (
              <p className="mt-3 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md px-3 py-2">{t("app.share.success")}</p>
            )}
            {shareResult === "error" && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-800 rounded-md px-3 py-2">{t("app.share.error")}</p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShareOpen(false)}
                className="flex-1 rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800"
              >
                {t("edit.cancel")}
              </button>
              <button
                onClick={handleShareInvite}
                disabled={shareSending || !shareEmail.includes("@")}
                className="flex-1 rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {shareSending ? t("app.share.sending") : t("app.share.send")}
              </button>
            </div>
          </div>
        </div>
      )}

      {uiV2 && !wsAdminOnly && (
        <>
          <CommandPalette />
          <CreateMenu fab />
        </>
      )}
    </div>
  );
}
