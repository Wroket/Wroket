"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getMe, logout, AuthMeResponse } from "@/lib/api";

interface AppShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  {
    label: "Accueil",
    href: "/dashboard",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
      </svg>
    ),
  },
  {
    label: "Mes tâches",
    href: "/todos",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: "Mes projets",
    href: "/projects",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
  {
    label: "Mes équipes",
    href: "/teams",
    icon: (
      <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

const SETTINGS_ITEM = {
  label: "Paramètres",
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

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [darkMode, setDarkMode] = useState(false);
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

  const handleLogout = async () => {
    try { await logout(); } finally { window.location.href = "/login"; }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-slate-950">
        <span className="text-zinc-400 dark:text-slate-500 text-sm">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-slate-950 transition-colors">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-zinc-200 dark:border-slate-700 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-zinc-900 dark:bg-white flex items-center justify-center">
              <span className="text-white dark:text-slate-900 text-sm font-bold">W</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-slate-100 leading-tight">Wroket</h1>
              <p className="text-zinc-400 text-xs">{me?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* ── Sidebar ── */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white dark:bg-slate-900 border-r border-zinc-200 dark:border-slate-700 min-h-[calc(100vh-65px)] py-4 px-3 gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} active={pathname === item.href} />
          ))}
          <hr className="border-zinc-200 dark:border-slate-700 my-2" />
          <NavLink href={SETTINGS_ITEM.href} icon={SETTINGS_ITEM.icon} label={SETTINGS_ITEM.label} active={pathname === SETTINGS_ITEM.href} />
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 py-6 px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
