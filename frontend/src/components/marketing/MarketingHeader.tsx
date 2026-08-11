"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WroketLockup } from "@/components/brand/WroketBrand";
import { useLocale } from "@/lib/LocaleContext";

export function MarketingHeader() {
  const { t, locale, setLocale } = useLocale();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("wroket-dark") === "1";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("wroket-dark", next ? "1" : "0");
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 min-w-0" aria-label={t("nav.home")}>
          <WroketLockup theme="auto" />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
            className="text-xs font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-800 dark:hover:text-slate-200 transition-colors px-2 py-1 rounded"
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>
          <span className="w-px h-4 bg-zinc-200 dark:bg-slate-700 shrink-0" aria-hidden="true" />
          <button
            type="button"
            onClick={toggleDark}
            className="p-2 rounded-lg text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            aria-label={dark ? t("a11y.toggleDarkMode") : t("a11y.toggleLightMode")}
          >
            {dark ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
          <Link
            href="/pricing"
            className="hidden sm:inline-flex text-sm font-medium text-zinc-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            {t("landing.navPricing")}
          </Link>
          <Link
            href="/login?mode=register"
            className="inline-flex items-center justify-center text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap"
          >
            {t("landing.cta")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
