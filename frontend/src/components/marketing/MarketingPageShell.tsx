"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { WroketLockup } from "@/components/brand/WroketBrand";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

export type MarketingRelatedLink = {
  href: string;
  labelKey: TranslationKey;
};

type MarketingSection = {
  titleKey: TranslationKey;
  paragraphKeys: TranslationKey[];
};

type MarketingPageShellProps = {
  h1Key: TranslationKey;
  introKey: TranslationKey;
  sections: MarketingSection[];
  /** Product mock under the hero. */
  visual?: ReactNode;
  relatedLinks?: MarketingRelatedLink[];
  ctaHref?: string;
  ctaLabelKey?: TranslationKey;
  secondaryCtaHref?: string;
  secondaryCtaLabelKey?: TranslationKey;
};

const DEFAULT_RELATED: MarketingRelatedLink[] = [
  { href: "/agenda-taches", labelKey: "landing.footerAgendaTasks" },
  { href: "/gestion-taches-equipe", labelKey: "landing.footerTeamTasks" },
  { href: "/matrice-eisenhower", labelKey: "landing.footerEisenhower" },
];

const PATTERN_BG =
  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")";

/**
 * Shared chrome for SEO satellite pages — aligned with landing teal/stone brand.
 */
export function MarketingPageShell({
  h1Key,
  introKey,
  sections,
  visual,
  relatedLinks = DEFAULT_RELATED,
  ctaHref = "/login?mode=register",
  ctaLabelKey = "marketing.shell.start",
  secondaryCtaHref = "/pricing",
  secondaryCtaLabelKey = "marketing.shell.viewPricing",
}: MarketingPageShellProps) {
  const { t, locale, setLocale } = useLocale();
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
    <div className="landing-manrope min-h-screen text-stone-900 dark:text-stone-100 dark:bg-[#2a2826] transition-colors">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#fafaf9]/85 dark:bg-[#2a2826]/90 border-b border-stone-200/70 dark:border-stone-600/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 min-w-0">
            <WroketLockup theme="auto" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
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
              href="/pricing"
              className="hidden sm:inline-flex text-sm font-medium text-stone-700 dark:text-stone-300 hover:text-teal-700"
            >
              {t("landing.navPricing")}
            </Link>
            <Link
              href="/login?mode=register"
              className="inline-flex text-xs sm:text-sm font-medium bg-teal-700 hover:bg-teal-800 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg"
            >
              {t("landing.cta")}
            </Link>
          </div>
        </div>
      </nav>

      <header
        className={`relative overflow-hidden border-b border-stone-200/80 dark:border-stone-600/30 ${
          dark ? "bg-[#2a2826]" : "bg-[#fafaf9]"
        }`}
      >
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background: dark
              ? "radial-gradient(ellipse 80% 60% at 70% 30%, rgba(45,212,191,0.18), transparent 55%), linear-gradient(165deg, #353230 0%, #2a2826 55%, #1f4a45 140%)"
              : "radial-gradient(ellipse 80% 60% at 70% 30%, rgba(15,118,110,0.18), transparent 55%), linear-gradient(165deg, #fafaf9 0%, #ecfdf5 50%, #e7e5e4 100%)",
          }}
        />
        <div
          className={`absolute inset-0 ${dark ? "opacity-20" : "opacity-[0.3]"}`}
          aria-hidden
          style={{ backgroundImage: PATTERN_BG }}
        />
        <div className="relative max-w-3xl mx-auto px-6 pt-14 sm:pt-16 pb-8">
          <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight leading-[1.12] text-stone-900 dark:text-stone-50">
            {t(h1Key)}
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-stone-600 dark:text-stone-300 leading-relaxed max-w-2xl">
            {t(introKey)}
          </p>
          <div className="w-16 h-1 bg-teal-700 rounded-full mt-6" />
        </div>
        {visual ? (
          <div className="relative max-w-3xl mx-auto px-6 pb-12 sm:pb-14" aria-hidden>
            {visual}
          </div>
        ) : (
          <div className="pb-6" />
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 sm:py-16">
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.titleKey}>
              <h2 className="text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-50 mb-3">
                {t(section.titleKey)}
              </h2>
              {section.paragraphKeys.map((pKey) => (
                <p key={pKey} className="text-base text-stone-600 dark:text-stone-300 leading-relaxed">
                  {t(pKey)}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center bg-teal-700 hover:bg-teal-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            {t(ctaLabelKey)}
          </Link>
          {secondaryCtaHref && secondaryCtaLabelKey ? (
            <Link
              href={secondaryCtaHref}
              className="inline-flex items-center justify-center border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-200 font-semibold px-6 py-3 rounded-xl hover:border-teal-600 dark:hover:border-teal-500 transition-colors"
            >
              {t(secondaryCtaLabelKey)}
            </Link>
          ) : null}
        </div>

        {relatedLinks.length > 0 && (
          <div className="mt-12 pt-8 border-t border-stone-200/80 dark:border-stone-600/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-3">
              {t("marketing.shell.related")}
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-teal-700 dark:text-teal-300 hover:underline font-medium">
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <LandingFooter className="dark:border-stone-600/30" />
    </div>
  );
}

/**
 * @deprecated Prefer MarketingPageShell props directly. Kept for call-site clarity if needed.
 */
export function MarketingArticle({
  h1Key,
  introKey,
  sections,
}: {
  h1Key: TranslationKey;
  introKey: TranslationKey;
  sections: MarketingSection[];
}) {
  return <MarketingPageShell h1Key={h1Key} introKey={introKey} sections={sections} />;
}
