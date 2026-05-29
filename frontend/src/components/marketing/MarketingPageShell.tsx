"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

export type MarketingRelatedLink = {
  href: string;
  labelKey: TranslationKey;
};

type MarketingPageShellProps = {
  children: ReactNode;
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

export function MarketingPageShell({
  children,
  relatedLinks = DEFAULT_RELATED,
  ctaHref = "/login",
  ctaLabelKey = "marketing.shell.start",
  secondaryCtaHref = "/pricing",
  secondaryCtaLabelKey = "marketing.shell.viewPricing",
}: MarketingPageShellProps) {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header className="border-b border-zinc-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-zinc-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400">
            ← Wroket
          </Link>
          <Link href="/pricing" className="text-sm text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            {t("landing.navPricing")}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-zinc dark:prose-invert prose-headings:scroll-mt-20">
        {children}
      </main>

      <section className="max-w-3xl mx-auto px-6 pb-12">
        <div className="flex flex-col sm:flex-row gap-4 not-prose">
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-sm"
          >
            {t(ctaLabelKey)}
          </Link>
          {secondaryCtaHref && secondaryCtaLabelKey ? (
            <Link
              href={secondaryCtaHref}
              className="inline-flex items-center justify-center border border-zinc-200 dark:border-slate-700 text-zinc-700 dark:text-slate-300 font-semibold px-6 py-3 rounded-xl hover:border-emerald-400 transition-colors"
            >
              {t(secondaryCtaLabelKey)}
            </Link>
          ) : null}
        </div>
        {relatedLinks.length > 0 && (
          <div className="mt-10 pt-8 border-t border-zinc-100 dark:border-slate-800 not-prose">
            <p className="text-sm font-medium text-zinc-700 dark:text-slate-300 mb-3">{t("marketing.shell.related")}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="border-t border-zinc-100 dark:border-slate-800 py-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500 dark:text-slate-400">
          <span>
            <span className="font-semibold text-zinc-700 dark:text-slate-300">Wroket</span>{" "}
            <span suppressHydrationWarning>&copy; {new Date().getFullYear()}</span>
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/privacy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {t("landing.footerPrivacy")}
            </Link>
            <Link href="/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {t("landing.footerTerms")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

type MarketingSection = {
  titleKey: TranslationKey;
  paragraphKeys: TranslationKey[];
};

export function MarketingArticle({
  h1Key,
  introKey,
  sections,
}: {
  h1Key: TranslationKey;
  introKey: TranslationKey;
  sections: MarketingSection[];
}) {
  const { t } = useLocale();

  return (
    <>
      <h1>{t(h1Key)}</h1>
      <p className="lead">{t(introKey)}</p>
      {sections.map((section) => (
        <section key={section.titleKey}>
          <h2>{t(section.titleKey)}</h2>
          {section.paragraphKeys.map((pKey) => (
            <p key={pKey}>{t(pKey)}</p>
          ))}
        </section>
      ))}
    </>
  );
}
