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
      className="h-[240px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded-2xl"
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
          className="p-6 rounded-2xl bg-white border border-stone-200/90 shadow-[0_1px_0_rgba(28,25,23,0.04)] dark:bg-stone-700/80 dark:border-stone-500/40 flex flex-col"
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-800 dark:bg-teal-800/40 dark:text-teal-200 flex items-center justify-center mb-4 ring-1 ring-teal-900/10 dark:ring-teal-400/25">
            {icon}
          </div>
          <h3 className="text-base font-semibold mb-2 text-stone-900 dark:text-stone-50">{t(titleKey)}</h3>
          <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed flex-1">{t(descKey)}</p>
        </div>
        <div
          className="p-4 rounded-2xl bg-stone-900 text-stone-100 border border-stone-700/80 shadow-[0_18px_40px_-24px_rgba(15,118,110,0.55)] flex flex-col overflow-hidden"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundImage:
              "radial-gradient(ellipse 90% 70% at 100% 0%, rgba(15,118,110,0.28), transparent 55%), linear-gradient(165deg, #1c1917 0%, #0f172a 55%, #134e4a 140%)",
          }}
        >
          <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
            <h3 className="text-[11px] font-semibold tracking-wide uppercase text-teal-200/90 flex items-center gap-1.5">
              <span className="text-teal-300 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
              {t(titleKey)}
            </h3>
            <span className="text-[9px] font-medium text-stone-500 tabular-nums">live</span>
          </div>
          <div className="flex-1 flex items-stretch min-h-0">{preview}</div>
        </div>
      </div>
    </div>
  );
}

function FeaturePreview({ id, fr }: { id: string; fr: boolean }) {
  switch (id) {
    case "eisenhower":
      return (
        <div className="grid grid-cols-2 gap-1.5 w-full self-center">
          {[
            { label: fr ? "Urgent + Important" : "Urgent + Important", bg: "bg-red-500/20", text: "text-red-200", ring: "ring-red-400/30" },
            { label: "Important", bg: "bg-amber-500/20", text: "text-amber-200", ring: "ring-amber-400/30" },
            { label: fr ? "Urgent" : "Urgent", bg: "bg-sky-500/20", text: "text-sky-200", ring: "ring-sky-400/30" },
            { label: fr ? "Planifier" : "Schedule", bg: "bg-stone-500/20", text: "text-stone-300", ring: "ring-stone-400/20" },
          ].map((q) => (
            <div
              key={q.label}
              className={`${q.bg} ring-1 ${q.ring} rounded-lg p-2 flex flex-col items-center justify-center min-h-[56px]`}
            >
              <span className={`text-[10px] font-semibold ${q.text} text-center leading-tight`}>{q.label}</span>
            </div>
          ))}
        </div>
      );
    case "calendar":
      return (
        <div className="w-full space-y-1.5 self-center rounded-xl bg-stone-950/50 ring-1 ring-white/10 p-2.5">
          {["09:00", "10:00", "11:00"].map((h, i) => (
            <div key={h} className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 w-8 shrink-0 font-mono">{h}</span>
              {i === 1 ? (
                <div className="flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40 border-l-2 border-teal-400">
                  {fr ? "Focus deep work" : "Deep work block"}
                </div>
              ) : (
                <div className="flex-1 rounded-md border border-dashed border-stone-600/80 h-7" />
              )}
            </div>
          ))}
        </div>
      );
    case "integrations":
      return (
        <div className="w-full flex flex-col gap-2 self-center min-h-0">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "Notion", status: fr ? "Importé" : "Synced", on: true },
              { label: "Monday", status: fr ? "Prêt" : "Ready", on: true },
              { label: "Google", status: "Calendar", on: true },
              { label: "Outlook", status: "Calendar", on: true },
            ].map(({ label, status, on }) => (
              <div
                key={label}
                className="rounded-lg px-2 py-2 bg-stone-950/55 text-stone-100 ring-1 ring-white/10 flex items-center gap-2 min-w-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${on ? "bg-teal-400" : "bg-stone-500"}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold tracking-wide truncate">{label}</div>
                  <div className={`text-[8px] truncate ${on ? "text-teal-300/80" : "text-stone-500"}`}>{status}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-stone-950/55 ring-1 ring-white/10 px-2.5 py-2 flex items-center gap-2">
            <span className="text-[9px] font-semibold text-stone-400 uppercase tracking-wide shrink-0">
              {fr ? "Notifs" : "Alerts"}
            </span>
            <span className="text-[10px] text-stone-200 truncate">Slack · Discord · Teams</span>
          </div>
        </div>
      );
    case "kanban":
      return (
        <div className="w-full flex flex-col gap-2 self-center min-h-0">
          <div className="flex gap-1.5 flex-1 min-h-0">
            {[
              {
                phase: "Design",
                count: 2,
                tasks: [
                  { label: fr ? "Moodboard" : "Moodboard", accent: "bg-amber-400/80" },
                  { label: fr ? "Wireframes" : "Wireframes", accent: "bg-amber-400/40" },
                ],
              },
              {
                phase: "Dev",
                count: 1,
                tasks: [{ label: fr ? "API auth" : "Auth API", accent: "bg-teal-400" }],
              },
              {
                phase: "Done",
                count: 1,
                tasks: [{ label: "CI ✓", accent: "bg-emerald-400/80" }],
              },
            ].map(({ phase, count, tasks }) => (
              <div key={phase} className="flex-1 min-w-0 rounded-lg bg-stone-950/55 ring-1 ring-white/10 p-1.5 flex flex-col">
                <div className="flex items-center justify-between gap-1 px-0.5 mb-1">
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wide truncate">{phase}</span>
                  <span className="text-[9px] font-medium text-stone-500 tabular-nums">{count}</span>
                </div>
                {tasks.map((task) => (
                  <div
                    key={task.label}
                    className="mt-1 rounded-md bg-stone-800/95 pl-1.5 pr-2 py-1.5 text-[9px] text-stone-200 ring-1 ring-white/5 flex items-center gap-1.5 min-w-0"
                  >
                    <span className={`w-0.5 self-stretch rounded-full shrink-0 ${task.accent}`} aria-hidden />
                    <span className="truncate">{task.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-stone-950/55 ring-1 ring-white/10 px-2 py-1.5 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] font-semibold uppercase tracking-wider text-stone-500">Gantt</span>
              <span className="text-[8px] text-stone-600">{fr ? "Sem. 12–14" : "Wk 12–14"}</span>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 rounded-full bg-stone-800 overflow-hidden">
                <div className="h-full w-[72%] rounded-full bg-teal-500/90" />
              </div>
              <div className="h-1.5 rounded-full bg-stone-800 overflow-hidden">
                <div className="h-full w-[38%] ml-[20%] rounded-full bg-amber-400/80" />
              </div>
            </div>
          </div>
        </div>
      );
    case "collab":
      return (
        <div className="w-full flex flex-col gap-2 self-center">
          <div className="flex items-start gap-2.5 rounded-xl bg-stone-950/55 ring-1 ring-white/10 px-2.5 py-2">
            <span
              className="w-7 h-7 rounded-full bg-teal-700 text-[10px] font-bold text-white flex items-center justify-center shrink-0"
              aria-hidden
            >
              J
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-stone-100">Julie</span>
                <span className="text-[9px] text-stone-500">2m</span>
              </div>
              <p className="text-[10px] text-stone-300 leading-snug mt-0.5">
                {fr ? "vous a assigné « Revue brief client »" : "assigned you “Client brief review”"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-teal-950/40 ring-1 ring-teal-500/30 px-2.5 py-2 ml-4">
            <span
              className="w-7 h-7 rounded-full bg-stone-600 text-[10px] font-bold text-white flex items-center justify-center shrink-0"
              aria-hidden
            >
              M
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-teal-100">Marc</span>
                <span className="text-[9px] text-stone-500">now</span>
              </div>
              <p className="text-[10px] text-teal-50/90 leading-snug mt-0.5">
                {fr ? "OK, je m’en occupe avant 16h." : "On it — done before 4pm."}
              </p>
            </div>
          </div>
        </div>
      );
    case "notifs":
      return (
        <div className="w-full flex flex-col gap-2 self-center min-h-0">
          <div className="space-y-1.5">
            {[
              {
                label: fr ? "Deadline dans 1h" : "Deadline in 1h",
                meta: fr ? "Revue brief" : "Brief review",
                tone: "urgent" as const,
              },
              {
                label: fr ? "Nouvelle assignation" : "New assignment",
                meta: "Julie → vous",
                tone: "info" as const,
              },
              {
                label: fr ? "Nouveau commentaire" : "New comment",
                meta: "Marc",
                tone: "info" as const,
              },
            ].map((n) => (
              <div
                key={n.label}
                className="flex items-center gap-2.5 rounded-lg bg-stone-950/55 ring-1 ring-white/10 px-2.5 py-1.5"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${n.tone === "urgent" ? "bg-amber-400" : "bg-teal-400"}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] text-stone-100 font-medium truncate">{n.label}</div>
                  <div className="text-[8px] text-stone-500 truncate">{n.meta}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-stone-950/55 ring-1 ring-white/10 px-2.5 py-2 flex items-center gap-2">
            <span className="text-[10px] text-stone-300 truncate">Slack · Discord · Teams</span>
          </div>
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
      className="landing-manrope min-h-screen text-stone-900 dark:text-stone-100 dark:bg-[#2a2826] transition-colors"
      style={
        {
          ["--landing-ink" as string]: "#1c1917",
          ["--landing-accent" as string]: "#0f766e",
          ["--landing-mist" as string]: "#ecfdf5",
        } as CSSProperties
      }
    >
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

      {/* Hero: brand + one headline + one line + CTA — contrast tied to theme */}
      <section
        className={`relative min-h-[88vh] flex flex-col overflow-hidden ${
          dark ? "bg-[#2a2826]" : "bg-[#fafaf9]"
        }`}
      >
        <div
          className="absolute inset-0 landing-hero-drift"
          aria-hidden
          style={{
            background: dark
              ? "radial-gradient(ellipse 85% 65% at 75% 35%, rgba(45,212,191,0.22), transparent 55%), radial-gradient(ellipse 55% 45% at 15% 75%, rgba(15,118,110,0.28), transparent 50%), linear-gradient(165deg, #353230 0%, #1f4a45 48%, #3f3a36 100%)"
              : "radial-gradient(ellipse 80% 60% at 70% 40%, rgba(15,118,110,0.22), transparent 55%), radial-gradient(ellipse 50% 40% at 15% 80%, rgba(28,25,23,0.08), transparent 50%), linear-gradient(165deg, #fafaf9 0%, #ecfdf5 45%, #e7e5e4 100%)",
          }}
        />
        <div className="relative flex-1 flex flex-col justify-center max-w-5xl mx-auto px-6 py-16 sm:py-20 w-full">
          <div
            className={`mb-8 sm:mb-10 transition-all duration-700 ease-out ${
              entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"
            }`}
          >
            <WroketLockup
              theme={dark ? "dark" : "light"}
              className="scale-125 sm:scale-150 origin-left"
            />
          </div>

          <h1
            className={`text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] max-w-3xl transition-all duration-700 delay-150 ease-out ${
              dark ? "text-stone-50" : "text-stone-900"
            } ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            {t("landing.heroTitle").split("\n").map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {i === 0 ? (
                  line
                ) : (
                  <span className="bg-gradient-to-r from-teal-600 to-emerald-400 bg-clip-text text-transparent">
                    {line}
                  </span>
                )}
              </span>
            ))}
          </h1>

          <p
            className={`mt-5 text-lg sm:text-xl max-w-xl leading-relaxed transition-all duration-700 delay-300 ease-out ${
              dark ? "text-stone-200" : "text-stone-700"
            } ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
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
            <Link
              href="/login"
              className={`text-sm font-medium underline-offset-2 hover:underline py-3 ${
                dark ? "text-stone-300 hover:text-teal-300" : "text-stone-700 hover:text-teal-800"
              }`}
            >
              {t("landing.ctaLogin")}
            </Link>
          </div>
        </div>

        {/* Full-bleed product preview (edge-to-edge mock UI) */}
        <div
          className={`relative w-full border-t border-stone-200/80 dark:border-stone-600/35 transition-opacity duration-1000 delay-700 ${
            entered ? "opacity-100" : "opacity-0"
          }`}
        >
          <div
            className="absolute inset-0 bg-stone-100/90 dark:bg-[#1a1816]"
            aria-hidden
            style={{
              backgroundImage: dark
                ? "radial-gradient(ellipse 70% 80% at 50% 0%, rgba(15,118,110,0.35), transparent 60%)"
                : "radial-gradient(ellipse 80% 70% at 50% 0%, rgba(15,118,110,0.14), transparent 65%)",
            }}
          />
          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-10 sm:pb-12">
            <div
              className="rounded-t-2xl border border-b-0 border-stone-200/90 dark:border-stone-600/50 bg-stone-50 dark:bg-stone-800 overflow-hidden shadow-[0_16px_40px_-20px_rgba(28,25,23,0.18)] dark:shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.45)]"
              role="img"
              aria-label={locale === "fr" ? "Aperçu de la liste de tâches Wroket" : "Wroket task list preview"}
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200 dark:border-stone-700 bg-stone-100/90 dark:bg-stone-900/80">
                <div className="flex gap-1.5" aria-hidden>
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/90" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400/90" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/90" />
                </div>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 ml-1 font-mono">{t("landing.preview.chrome")}</span>
              </div>
              <div className="p-4 sm:p-5 space-y-2.5 bg-white dark:bg-stone-900">
                {(
                  [
                    {
                      labelKey: "landing.preview.task1" as const,
                      prioKey: "landing.preview.prioHigh" as const,
                      color: "bg-red-100 dark:bg-red-900/35 text-red-700 dark:text-red-300",
                      check: true,
                      tag: "marketing",
                      slotKey: "landing.preview.slot1" as const,
                    },
                    {
                      labelKey: "landing.preview.task2" as const,
                      prioKey: "landing.preview.prioHigh" as const,
                      color: "bg-amber-100 dark:bg-amber-900/35 text-amber-800 dark:text-amber-300",
                      check: false,
                      tag: null,
                      slotKey: "landing.preview.slot2" as const,
                    },
                    {
                      labelKey: "landing.preview.task3" as const,
                      prioKey: "landing.preview.prioMed" as const,
                      color: "bg-sky-100 dark:bg-sky-900/35 text-sky-800 dark:text-sky-300",
                      check: false,
                      tag: "tech",
                      slotKey: null,
                    },
                    {
                      labelKey: "landing.preview.task4" as const,
                      prioKey: "landing.preview.prioLow" as const,
                      color: "bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300",
                      check: false,
                      tag: null,
                      slotKey: null,
                    },
                  ] as const
                ).map((task) => (
                  <div
                    key={task.labelKey}
                    className="flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg bg-stone-50 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/60"
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                        task.check
                          ? "bg-teal-600 border-teal-600"
                          : "border-stone-300 dark:border-stone-500"
                      }`}
                      aria-hidden
                    >
                      {task.check && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span
                      className={`text-sm flex-1 min-w-0 truncate text-left ${
                        task.check
                          ? "line-through text-stone-400 dark:text-stone-500"
                          : "text-stone-800 dark:text-stone-100"
                      }`}
                    >
                      {t(task.labelKey)}
                    </span>
                    {task.tag && (
                      <span className="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 shrink-0">
                        {task.tag}
                      </span>
                    )}
                    {task.slotKey && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 shrink-0">
                        {t(task.slotKey)}
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 min-w-[4.5rem] text-center ${task.color}`}
                    >
                      {t(task.prioKey)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-[#fafaf9] dark:bg-[#2f2c2a] border-b border-stone-200 dark:border-stone-600/30">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-4 text-stone-900 dark:text-stone-50">
            {t("landing.howItWorks.title")}
          </h2>
          <div className="w-16 h-1 bg-teal-700 rounded-full mx-auto mb-12" />
          <ol className="grid sm:grid-cols-2 gap-10">
            {HOW_IT_WORKS_STEPS.map((step, i) => (
              <li key={step.titleKey} className="flex gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-700 text-white text-sm font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold mb-1">{t(step.titleKey)}</h3>
                  <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">{t(step.descKey)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-24 bg-stone-100/80 dark:bg-[#383430]">
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

      <section className="py-24 bg-[#fafaf9] dark:bg-[#2f2c2a]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="wroket-mark-tile w-16 h-16 bg-stone-800 dark:bg-stone-700 flex items-center justify-center mx-auto mb-6">
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
            <Link href="/login" className="text-sm font-medium text-stone-600 dark:text-stone-300 dark:hover:text-teal-300 hover:text-teal-800 underline-offset-2 hover:underline">
              {t("landing.ctaLogin")}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter className="dark:border-stone-600/30" />

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
