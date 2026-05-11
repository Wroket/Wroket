"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { WroketLockup, WroketMark } from "@/components/brand/WroketBrand";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

const MAIL_TEAM = "mailto:team@wroket.com";

function TierBullets({ keys }: { keys: TranslationKey[] }) {
  const { t } = useLocale();
  return (
    <ul className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-slate-400">
      {keys.map((k) => (
        <li key={k} className="flex gap-2">
          <span className="text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden>
            •
          </span>
          <span>{t(k)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  const { t, locale, setLocale } = useLocale();
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("wroket-dark") === "1",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("wroket-dark", next ? "1" : "0");
      return next;
    });
  };

  const tierCardBase =
    "relative flex flex-col rounded-2xl border bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm transition-shadow";

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100 transition-colors">
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-zinc-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <WroketLockup theme="auto" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
              className="text-xs font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-800 dark:hover:text-slate-200 transition-colors px-2 py-1 rounded"
            >
              {locale === "fr" ? "EN" : "FR"}
            </button>
            <button
              type="button"
              onClick={toggleDark}
              className="p-2 rounded-lg text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
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
              href="/login"
              className="text-sm font-medium text-zinc-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {t("landing.ctaLogin")}
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              {t("landing.cta")}
            </Link>
          </div>
        </div>
      </nav>

      <header className="relative overflow-hidden border-b border-zinc-100 dark:border-slate-800 min-h-[15rem] sm:min-h-[17rem]">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-indigo-50 dark:from-emerald-950/20 dark:via-slate-950 dark:to-indigo-950/20" />
        <div className="relative max-w-4xl mx-auto px-6 py-16 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-slate-50">{t("pricing.heroTitle")}</h1>
          <p className="mt-4 text-lg text-zinc-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">{t("pricing.heroSub")}</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          {/* Free */}
          <div className={`${tierCardBase} border-zinc-200 dark:border-slate-700`}>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-slate-50 pt-2">{t("settings.plan.free")}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-slate-400">{t("pricing.tier.free.tagline")}</p>
            <p className="mt-4 text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("pricing.priceFree")}</p>
            <TierBullets keys={["pricing.tier.free.b1", "pricing.tier.free.b2", "pricing.tier.free.b3"]} />
            <div className="mt-auto pt-8">
              <Link
                href="/login"
                className="inline-flex w-full justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold py-3 px-4 text-sm transition-colors"
              >
                {t("pricing.cta.createAccount")}
              </Link>
            </div>
          </div>

          {/* 1st in */}
          <div className={`${tierCardBase} border-zinc-200 dark:border-slate-700`}>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-slate-50 pt-2">{t("settings.plan.first")}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-slate-400">{t("pricing.tier.first.tagline")}</p>
            <p className="mt-4 text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("pricing.priceSoon")}</p>
            <TierBullets keys={["pricing.tier.first.b1", "pricing.tier.first.b2", "pricing.tier.first.b3"]} />
            <div className="mt-auto pt-8">
              <a
                href={`${MAIL_TEAM}?subject=${encodeURIComponent("Wroket - 1st in")}`}
                className="inline-flex w-full justify-center rounded-xl border border-zinc-300 dark:border-slate-600 font-semibold py-3 px-4 text-sm text-zinc-800 dark:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("pricing.cta.contactUs")}
              </a>
            </div>
          </div>

          {/* Small teams — recommended */}
          <div
            className={`${tierCardBase} border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-500/25 dark:ring-emerald-500/30 shadow-lg shadow-emerald-500/10`}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex rounded-full bg-emerald-600 text-white text-xs font-bold px-3 py-1 shadow-md">
                {t("pricing.recommended")}
              </span>
            </div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-slate-50 pt-2">{t("settings.plan.small")}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-slate-400">{t("pricing.tier.small.tagline")}</p>
            <p className="mt-4 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{t("pricing.priceOnRequest")}</p>
            <TierBullets keys={["pricing.tier.small.b1", "pricing.tier.small.b2", "pricing.tier.small.b3"]} />
            <div className="mt-auto pt-8">
              <a
                href={`${MAIL_TEAM}?subject=${encodeURIComponent("Wroket - Small teams")}`}
                className="inline-flex w-full justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold py-3 px-4 text-sm transition-colors"
              >
                {t("pricing.cta.contactUs")}
              </a>
            </div>
          </div>

          {/* Large */}
          <div className={`${tierCardBase} border-zinc-200 dark:border-slate-700`}>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-slate-50 pt-2">{t("settings.plan.large")}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-slate-400">{t("pricing.tier.large.tagline")}</p>
            <p className="mt-4 text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("pricing.priceOnRequest")}</p>
            <TierBullets keys={["pricing.tier.large.b1", "pricing.tier.large.b2", "pricing.tier.large.b3"]} />
            <div className="mt-auto pt-8">
              <a
                href={`${MAIL_TEAM}?subject=${encodeURIComponent("Wroket - Large teams")}`}
                className="inline-flex w-full justify-center rounded-xl border border-zinc-300 dark:border-slate-600 font-semibold py-3 px-4 text-sm text-zinc-800 dark:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("pricing.cta.contactUs")}
              </a>
            </div>
          </div>
        </div>

        <section className="mt-20 max-w-3xl mx-auto" aria-labelledby="pricing-faq-heading">
          <h2 id="pricing-faq-heading" className="text-2xl font-bold text-center text-zinc-900 dark:text-slate-50 mb-10">
            {t("pricing.faqTitle")}
          </h2>
          <dl className="space-y-6">
            {(
              [
                ["pricing.faq1q", "pricing.faq1a"],
                ["pricing.faq2q", "pricing.faq2a"],
                ["pricing.faq3q", "pricing.faq3a"],
                ["pricing.faq4q", "pricing.faq4a"],
              ] as const
            ).map(([q, a]) => (
              <div key={q} className="rounded-xl border border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-900/50 p-5">
                <dt className="font-semibold text-zinc-900 dark:text-slate-100">{t(q)}</dt>
                <dd className="mt-2 text-sm text-zinc-600 dark:text-slate-400 leading-relaxed">{t(a)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <WroketMark />
          </div>
          <p className="text-lg font-semibold text-zinc-800 dark:text-slate-200">{t("landing.footerTag")}</p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold px-8 py-3 rounded-xl transition-all"
            >
              {t("landing.cta")}
            </Link>
            <Link href="/" className="text-sm font-medium text-zinc-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">
              ← {t("nav.home")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100 dark:border-slate-800 py-8 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-slate-400">
            <span className="font-semibold text-zinc-700 dark:text-slate-300">Wroket</span>
            <span suppressHydrationWarning>&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500 dark:text-slate-400">
            <Link href="/pricing" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {t("landing.navPricing")}
            </Link>
            <a href="mailto:team@wroket.com" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {t("landing.footerContact")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
