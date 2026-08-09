"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/components/AuthContext";
import { WroketLockup } from "@/components/brand/WroketBrand";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { useLocale } from "@/lib/LocaleContext";

/**
 * Shared chrome for /docs hub and guide pages — teal/stone aligned with landing.
 */
export function DocsShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useLocale();
  const { user, loading } = useAuth();
  const [dark, setDark] = useState(false);
  const [themeMounted, setThemeMounted] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("wroket-dark") === "1";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    setThemeMounted(true);
  }, []);

  useEffect(() => {
    if (!themeMounted) return;
    document.documentElement.classList.toggle("dark", dark);
  }, [dark, themeMounted]);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("wroket-dark", next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="landing-manrope min-h-screen flex flex-col text-stone-900 dark:text-stone-100 dark:bg-[#2a2826] bg-[#fafaf9] transition-colors">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 dark:border-stone-600/40 bg-[#fafaf9]/90 dark:bg-[#2a2826]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="shrink-0 min-w-0" aria-label={t("nav.home")}>
            <WroketLockup theme="auto" className="h-7" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
              className="text-xs font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 px-2 py-1 rounded"
            >
              {locale === "fr" ? "EN" : "FR"}
            </button>
            <button
              type="button"
              onClick={toggleDark}
              className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700/60"
              aria-label={dark ? t("a11y.toggleLightMode") : t("a11y.toggleDarkMode")}
            >
              {!themeMounted ? (
                <span className="block w-4 h-4" aria-hidden />
              ) : dark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>
            <Link
              href="/docs"
              className="hidden sm:inline-flex text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-teal-700 dark:hover:text-teal-300"
            >
              {t("docs.title")}
            </Link>
            {!loading && user ? (
              <Link
                href="/todos"
                className="inline-flex text-xs sm:text-sm font-medium bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg"
              >
                {t("nav.myTasks")}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex text-sm font-medium text-stone-600 dark:text-stone-300 hover:text-teal-700"
                >
                  {t("login.title")}
                </Link>
                <Link
                  href="/login?mode=register"
                  className="inline-flex text-xs sm:text-sm font-medium bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg"
                >
                  {t("login.createAccount")}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">{children}</main>

      <LandingFooter className="mt-auto dark:border-stone-600/30" />
    </div>
  );
}
