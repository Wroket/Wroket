"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useAuth } from "@/components/AuthContext";
import { WroketLockup } from "@/components/brand/WroketBrand";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { useLocale } from "@/lib/LocaleContext";

export function DocsShell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header className="border-b border-zinc-100 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label={t("nav.home")}>
            <WroketLockup className="h-7" />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/docs"
              className="text-zinc-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
            >
              {t("docs.title")}
            </Link>
            {!loading && user ? (
              <Link
                href="/todos"
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-medium px-3 py-1.5 transition-colors"
              >
                {t("nav.myTasks")}
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-zinc-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">
                  {t("login.title")}
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-3 py-1.5 transition-colors"
                >
                  {t("login.createAccount")}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">{children}</main>

      <LandingFooter className="mt-auto" />
    </div>
  );
}
