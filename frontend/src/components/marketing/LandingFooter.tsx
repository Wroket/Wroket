"use client";

import Link from "next/link";

import { useLocale } from "@/lib/LocaleContext";

const linkClass =
  "hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors";

type LandingFooterProps = {
  /** Hide pricing link when already on /pricing */
  hidePricingLink?: boolean;
  className?: string;
};

export function LandingFooter({ hidePricingLink = false, className = "" }: LandingFooterProps) {
  const { t } = useLocale();

  return (
    <footer className={`border-t border-zinc-100 dark:border-slate-800 py-8 sm:py-10 ${className}`.trim()}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-zinc-500 dark:text-slate-400 text-center sm:text-left shrink-0">
            <span className="font-semibold text-zinc-700 dark:text-slate-300">Wroket</span>{" "}
            <span suppressHydrationWarning>&copy; {new Date().getFullYear()}</span>
          </p>
          <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:gap-x-16 text-sm text-zinc-500 dark:text-slate-400 max-w-md sm:max-w-none mx-auto sm:mx-0">
            <nav className="flex flex-col gap-2.5" aria-label={t("landing.footerNavProduct")}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                {t("landing.footerNavProduct")}
              </p>
              <Link href="/agenda-taches" className={linkClass}>
                {t("landing.footerAgendaTasks")}
              </Link>
              <Link href="/gestion-taches-equipe" className={linkClass}>
                {t("landing.footerTeamTasks")}
              </Link>
              <Link href="/matrice-eisenhower" className={linkClass}>
                {t("landing.footerEisenhower")}
              </Link>
              {!hidePricingLink && (
                <Link href="/pricing" className={linkClass}>
                  {t("landing.navPricing")}
                </Link>
              )}
            </nav>
            <nav className="flex flex-col gap-2.5" aria-label={t("landing.footerNavLegal")}>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">
                {t("landing.footerNavLegal")}
              </p>
              <Link href="/privacy" className={linkClass}>
                {t("landing.footerPrivacy")}
              </Link>
              <Link href="/terms" className={linkClass}>
                {t("landing.footerTerms")}
              </Link>
              <a href="mailto:team@wroket.com" className={linkClass}>
                {t("landing.footerContact")}
              </a>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
