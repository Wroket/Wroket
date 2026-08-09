"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { WroketLockup, WroketMark } from "@/components/brand/WroketBrand";
import { LandingFooter } from "@/components/marketing/LandingFooter";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

const SvgIcon = ({ d, className = "" }: { d: string; className?: string }) => (
  <svg className={`w-6 h-6 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const FEATURE_ICONS: Record<string, ReactNode> = {
  eisenhower: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  ),
  calendar: <SvgIcon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
  integrations: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
  kanban: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="12" rx="1" />
      <rect x="17" y="3" width="5" height="15" rx="1" />
    </svg>
  ),
  collab: <SvgIcon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
  notifs: <SvgIcon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />,
};

const FEATURES_KEYS = [
  { titleKey: "landing.f1.title", descKey: "landing.f1.desc", previewId: "eisenhower" },
  { titleKey: "landing.f2.title", descKey: "landing.f2.desc", previewId: "calendar" },
  { titleKey: "landing.f5.title", descKey: "landing.f5.desc", previewId: "collab" },
  { titleKey: "landing.f4.title", descKey: "landing.f4.desc", previewId: "kanban" },
  { titleKey: "landing.f3.title", descKey: "landing.f3.desc", previewId: "integrations" },
  { titleKey: "landing.f6.title", descKey: "landing.f6.desc", previewId: "notifs" },
] as const;

const HOW_IT_WORKS_STEPS = [
  { titleKey: "landing.howItWorks.step1.title", descKey: "landing.howItWorks.step1.desc" },
  { titleKey: "landing.howItWorks.step2.title", descKey: "landing.howItWorks.step2.desc" },
  { titleKey: "landing.howItWorks.step3.title", descKey: "landing.howItWorks.step3.desc" },
  { titleKey: "landing.howItWorks.step4.title", descKey: "landing.howItWorks.step4.desc" },
] as const;

function FlipCard({
  icon,
  titleKey,
  descKey,
  preview,
  t,
}: {
  icon: ReactNode;
  titleKey: TranslationKey;
  descKey: TranslationKey;
  preview: ReactNode;
  t: (k: TranslationKey) => string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      tabIndex={0}
      className="h-[220px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-2xl"
      style={{ perspective: "1000px" }}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
      onFocus={() => setFlipped(true)}
      onBlur={() => setFlipped(false)}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          className="p-6 rounded-2xl bg-white/90 border border-stone-200/80 flex flex-col"
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center mb-4">{icon}</div>
          <h3 className="text-base font-semibold mb-2 text-stone-900">{t(titleKey)}</h3>
          <p className="text-sm text-stone-600 leading-relaxed flex-1">{t(descKey)}</p>
        </div>
        <div
          className="p-5 rounded-2xl bg-white border border-teal-200 shadow-lg flex flex-col"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <h3 className="text-xs font-semibold text-teal-700 mb-3 flex items-center gap-1.5">
            <span className="text-teal-600">{icon}</span> {t(titleKey)}
          </h3>
          <div className="flex-1 flex items-center">{preview}</div>
        </div>
      </div>
    </div>
  );
}

function FeaturePreview({ id, fr }: { id: string; fr: boolean }) {
  switch (id) {
    case "eisenhower":
      return (
        <div className="grid grid-cols-2 gap-1.5 w-full">
          {[
            { label: fr ? "Urgent + Important" : "Urgent + Important", bg: "bg-red-100", text: "text-red-700" },
            { label: "Important", bg: "bg-amber-100", text: "text-amber-700" },
            { label: fr ? "Urgent" : "Urgent", bg: "bg-sky-100", text: "text-sky-700" },
            { label: fr ? "Planifier" : "Schedule", bg: "bg-stone-100", text: "text-stone-600" },
          ].map((q) => (
            <div key={q.label} className={`${q.bg} rounded-lg p-2 flex flex-col items-center justify-center min-h-[52px]`}>
              <span className={`text-[10px] font-semibold ${q.text} text-center leading-tight`}>{q.label}</span>
            </div>
          ))}
        </div>
      );
    case "calendar":
      return (
        <div className="w-full space-y-1.5">
          {["09:00", "10:00", "11:00"].map((h, i) => (
            <div key={h} className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 w-8 shrink-0 font-mono">{h}</span>
              {i === 1 ? (
                <div className="flex-1 rounded px-2 py-1 text-[10px] font-medium bg-teal-50 text-teal-800 border-l-2 border-teal-600">
                  {fr ? "Focus deep work" : "Deep work block"}
                </div>
              ) : (
                <div className="flex-1 rounded border border-dashed border-stone-200 h-6" />
              )}
            </div>
          ))}
        </div>
      );
    case "integrations":
      return (
        <div className="w-full grid grid-cols-2 gap-2">
          {["Notion", "Monday", "Google", "Outlook"].map((label) => (
            <div key={label} className="rounded-lg px-2.5 py-2 bg-stone-900 text-white">
              <span className="text-[10px] font-bold">{label}</span>
            </div>
          ))}
        </div>
      );
    case "kanban":
      return (
        <div className="w-full flex gap-2">
          {["Design", "Dev", "Done"].map((phase) => (
            <div key={phase} className="flex-1 min-w-0">
              <span className="text-[9px] font-bold text-stone-600 uppercase tracking-wide">{phase}</span>
              <div className="mt-1 bg-stone-50 rounded px-2 py-1.5 text-[9px] border border-stone-100">…</div>
            </div>
          ))}
        </div>
      );
    case "collab":
      return (
        <div className="w-full space-y-2 text-[10px] text-stone-700">
          <p>{fr ? "Julie vous a assigné une tâche" : "Julie assigned you a task"}</p>
          <p className="text-teal-700 font-medium">@Marc — {fr ? "OK, je m'en occupe" : "On it"}</p>
        </div>
      );
    case "notifs":
      return (
        <div className="w-full space-y-1.5 text-[10px] text-stone-700">
          <p>{fr ? "Deadline dans 1h" : "Deadline in 1h"}</p>
          <p>{fr ? "Nouveau commentaire" : "New comment"}</p>
        </div>
      );
    default:
      return null;
  }
}

export default function LandingPage() {
  const { t, locale, setLocale } = useLocale();
  const [dark, setDark] = useState(false);
  const [themeMounted, setThemeMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const isDark = localStorage.getItem("wroket-dark") === "1";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    setThemeMounted(true);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
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
    <div
      className="landing-manrope min-h-screen text-stone-900 dark:text-stone-100 transition-colors"
      style={
        {
          ["--landing-ink" as string]: "#1c1917",
          ["--landing-accent" as string]: "#0f766e",
          ["--landing-mist" as string]: "#ecfdf5",
        } as CSSProperties
      }
    >
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#fafaf9]/85 dark:bg-stone-950/85 border-b border-stone-200/70 dark:border-stone-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 min-w-0">
            <WroketLockup theme="auto" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
              className="text-xs font-medium text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 px-2 py-1 rounded"
            >
              {locale === "fr" ? "EN" : "FR"}
            </button>
            <button
              type="button"
              onClick={toggleDark}
              className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label={dark ? t("a11y.toggleLightMode") : t("a11y.toggleDarkMode")}
            >
              {!themeMounted ? (
                <span className="block w-4 h-4" aria-hidden />
              ) : dark ? (
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

      {/* Hero: brand + one headline + one line + CTA + full-bleed visual plane */}
      <section className="relative min-h-[88vh] flex flex-col overflow-hidden bg-[#fafaf9] dark:bg-stone-950">
        <div
          className="absolute inset-0 landing-hero-drift"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 70% 40%, rgba(15,118,110,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 15% 80%, rgba(28,25,23,0.08), transparent 50%), linear-gradient(165deg, #fafaf9 0%, #ecfdf5 45%, #e7e5e4 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-20"
          aria-hidden
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />

        <div className="relative flex-1 flex flex-col justify-center max-w-5xl mx-auto px-6 py-16 sm:py-20 w-full">
          <div
            className={`mb-8 sm:mb-10 transition-all duration-700 ease-out ${
              entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
            }`}
          >
            <WroketLockup theme="auto" className="scale-125 sm:scale-150 origin-left" />
          </div>

          <h1
            className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] text-stone-900 dark:text-stone-50 max-w-3xl transition-all duration-700 delay-150 ease-out ${
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {t("landing.heroTitle").split("\n").map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h1>

          <p
            className={`mt-5 text-lg sm:text-xl text-stone-600 dark:text-stone-400 max-w-xl leading-relaxed transition-all duration-700 delay-300 ease-out ${
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            {t("landing.heroSub")}
          </p>

          <div
            className={`mt-10 flex flex-col sm:flex-row items-start gap-4 transition-all duration-700 delay-500 ease-out ${
              entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <Link
              href="/login?mode=register"
              className="group inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold px-8 py-3.5 rounded-xl transition-transform hover:scale-[1.02]"
            >
              {t("landing.cta")}
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link href="/login" className="text-sm font-medium text-stone-600 hover:text-teal-800 underline-offset-2 hover:underline py-3">
              {t("landing.ctaLogin")}
            </Link>
          </div>
        </div>

        {/* Full-bleed product strip (edge-to-edge, not a floating card) */}
        <div
          className={`relative w-full border-t border-stone-200/80 dark:border-stone-800 bg-stone-900 text-stone-100 transition-opacity duration-1000 delay-700 ${
            entered ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap gap-3 justify-between items-center text-sm">
            <span className="font-mono text-teal-300/90 text-xs tracking-wide">wroket · tasks · calendar · notes</span>
            <div className="flex flex-wrap gap-2">
              {(locale === "fr"
                ? ["Prioriser", "Planifier", "Livrer"]
                : ["Prioritize", "Schedule", "Ship"]
              ).map((label) => (
                <span key={label} className="px-3 py-1 rounded-full bg-white/10 text-xs font-medium">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#fafaf9] dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12 text-stone-900 dark:text-stone-50">
            {t("landing.howItWorks.title")}
          </h2>
          <ol className="grid sm:grid-cols-2 gap-10">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <li key={step.titleKey} className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-700 text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold mb-1">{t(step.titleKey)}</h3>
                  <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{t(step.descKey)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-24 bg-stone-100/80 dark:bg-stone-900/40">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">{t("landing.featuresTitle")}</h2>
          <div className="w-16 h-1 bg-teal-700 rounded-full mx-auto mb-16" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES_KEYS.map((f) => (
              <FlipCard
                key={f.titleKey}
                icon={FEATURE_ICONS[f.previewId]}
                titleKey={f.titleKey}
                descKey={f.descKey}
                preview={<FeaturePreview id={f.previewId} fr={locale === "fr"} />}
                t={t}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-[#fafaf9] dark:bg-stone-950">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="wroket-mark-tile w-16 h-16 bg-stone-800 flex items-center justify-center mx-auto mb-6">
            <WroketMark />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t("landing.footerTag")}</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              href="/login?mode=register"
              className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-8 py-3.5 rounded-xl"
            >
              {t("landing.cta")}
            </Link>
            <Link href="/login" className="text-sm font-medium text-stone-600 hover:text-teal-800 underline-offset-2 hover:underline">
              {t("landing.ctaLogin")}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />

      <style jsx global>{`
        @keyframes landing-drift {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(-1.5%, 1%, 0) scale(1.03);
          }
        }
        .landing-hero-drift {
          animation: landing-drift 18s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-hero-drift {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
