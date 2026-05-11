"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { WroketLockup, WroketMark } from "@/components/brand/WroketBrand";
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
  notepad: <SvgIcon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
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
  { titleKey: "landing.f3.title", descKey: "landing.f3.desc", previewId: "notepad" },
  { titleKey: "landing.f4.title", descKey: "landing.f4.desc", previewId: "kanban" },
  { titleKey: "landing.f5.title", descKey: "landing.f5.desc", previewId: "collab" },
  { titleKey: "landing.f6.title", descKey: "landing.f6.desc", previewId: "notifs" },
] as const;

function FlipCard({ icon, titleKey, descKey, preview, t }: {
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
      className="h-[220px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 rounded-2xl"
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
        {/* Front */}
        <div
          className="p-6 rounded-2xl bg-white dark:bg-slate-800/50 border border-zinc-100 dark:border-slate-700/50 flex flex-col"
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
            {icon}
          </div>
          <h3 className="text-base font-semibold mb-2">{t(titleKey)}</h3>
          <p className="text-sm text-zinc-500 dark:text-slate-400 leading-relaxed flex-1">{t(descKey)}</p>
        </div>
        {/* Back */}
        <div
          className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-700 shadow-lg flex flex-col"
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <h3 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
            <span className="text-emerald-500 dark:text-emerald-400">{icon}</span> {t(titleKey)}
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
            { label: fr ? "Urgent + Important" : "Urgent + Important", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" },
            { label: "Important", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
            { label: fr ? "Urgent" : "Urgent", bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
            { label: fr ? "Planifier" : "Schedule", bg: "bg-zinc-100 dark:bg-slate-700", text: "text-zinc-600 dark:text-slate-300" },
          ].map((q) => (
            <div key={q.label} className={`${q.bg} rounded-lg p-2 flex flex-col items-center justify-center min-h-[52px]`}>
              <span className={`text-[10px] font-semibold ${q.text} text-center leading-tight`}>{q.label}</span>
              <div className="flex gap-0.5 mt-1">
                <div className={`w-1.5 h-1.5 rounded-full ${q.bg.replace("100", "400").replace("/40", "")}`} />
                <div className={`w-1.5 h-1.5 rounded-full ${q.bg.replace("100", "300").replace("/40", "")}`} />
              </div>
            </div>
          ))}
        </div>
      );
    case "calendar":
      return (
        <div className="w-full space-y-1.5">
          {["09:00", "09:30", "10:00", "10:30", "11:00"].map((h, i) => (
            <div key={h} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 dark:text-slate-500 w-8 shrink-0 font-mono">{h}</span>
              {i === 1 ? (
                <div className="flex-1 rounded px-2 py-1 text-[10px] font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-l-2 border-red-500">
                  {fr ? "Urgent : Démo client" : "Urgent: Client demo"}
                </div>
              ) : i === 2 ? (
                <div className="flex-1 rounded px-2 py-1 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-l-2 border-emerald-500">
                  perso@gmail.com
                </div>
              ) : i === 3 ? (
                <div className="flex-1 rounded px-2 py-1 text-[10px] font-medium bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-l-2 border-violet-500">
                  pro@company.com
                </div>
              ) : (
                <div className="flex-1 rounded border border-dashed border-zinc-200 dark:border-slate-700 h-6" />
              )}
            </div>
          ))}
        </div>
      );
    case "notepad":
      return (
        <div className="w-full bg-zinc-50 dark:bg-slate-800 rounded-lg p-3 space-y-1.5 text-left font-mono">
          <p className="text-[10px] text-zinc-700 dark:text-slate-200">{fr ? "Idées pour la V2 :" : "V2 ideas:"}</p>
          <p className="text-[10px] text-zinc-500 dark:text-slate-400">- {fr ? "Revoir le onboarding" : "Revamp onboarding"}</p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 dark:text-slate-400">-</span>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 rounded font-semibold">/task</span>
            <span className="text-[10px] text-zinc-600 dark:text-slate-300">{fr ? "Refactorer l'auth" : "Refactor auth"}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 dark:text-slate-400">-</span>
            <span className="text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-1 rounded font-semibold">/deadline</span>
            <span className="text-[10px] text-zinc-600 dark:text-slate-300">{fr ? "15 avril" : "April 15"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400">
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            {fr ? "Synchronisé" : "Synced"}
          </div>
        </div>
      );
    case "kanban":
      return (
        <div className="w-full flex gap-2">
          {[
            { phase: "Design", items: [fr ? "Maquettes" : "Mockups", "Review"], color: "bg-violet-400" },
            { phase: "Dev", items: ["Auth API", "Tests"], color: "bg-emerald-400" },
            { phase: "Deploy", items: ["CI/CD"], color: "bg-sky-400" },
          ].map((col) => (
            <div key={col.phase} className="flex-1 min-w-0">
              <div className="flex items-center gap-1 mb-1.5">
                <div className={`w-2 h-2 rounded-full ${col.color}`} />
                <span className="text-[9px] font-bold text-zinc-600 dark:text-slate-300 uppercase tracking-wide">{col.phase}</span>
              </div>
              <div className="space-y-1">
                {col.items.map((item) => (
                  <div key={item} className="bg-white dark:bg-slate-700 rounded px-2 py-1.5 text-[9px] text-zinc-700 dark:text-slate-200 border border-zinc-100 dark:border-slate-600 shadow-sm">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    case "collab":
      return (
        <div className="w-full space-y-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-slate-800">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-[7px] text-white font-bold shrink-0">J</div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-zinc-700 dark:text-slate-200">{fr ? "Julie a assigné" : "Julie assigned"} <span className="font-semibold">{fr ? "Refactorer l'auth" : "Refactor auth"}</span></p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[8px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 rounded-full font-medium">{fr ? "Accepter" : "Accept"}</span>
                <span className="text-[8px] bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 rounded-full font-medium">{fr ? "Refuser" : "Decline"}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-slate-800">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-[7px] text-white font-bold shrink-0">M</div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-zinc-700 dark:text-slate-200"><span className="text-indigo-600 dark:text-indigo-400 font-medium">@Marc</span> {fr ? "Bien reçu, je m'en occupe" : "Got it, I'm on it"}</p>
              <span className="text-[8px] text-zinc-400 dark:text-slate-500">{fr ? "il y a 5 min" : "5 min ago"}</span>
            </div>
          </div>
          <div className="flex gap-1.5 px-2">
            {["Slack", "Discord", "Teams"].map((p) => (
              <span key={p} className="text-[8px] bg-zinc-100 dark:bg-slate-700 text-zinc-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-medium">{p}</span>
            ))}
          </div>
        </div>
      );
    case "notifs":
      return (
        <div className="w-full space-y-1.5">
          {[
            { text: fr ? "Julie vous a assigné une tâche" : "Julie assigned you a task", time: "2 min", dot: "bg-emerald-500" },
            { text: fr ? "Deadline dans 1h : Démo client" : "Deadline in 1h: Client demo", time: "58 min", dot: "bg-amber-500" },
            { text: fr ? "Nouveau commentaire sur « Auth »" : "New comment on 'Auth'", time: "3h", dot: "bg-indigo-500" },
          ].map((n) => (
            <div key={n.text} className="flex items-start gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-slate-800">
              <div className={`w-2 h-2 rounded-full ${n.dot} mt-1 shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-zinc-700 dark:text-slate-200 leading-tight">{n.text}</p>
                <p className="text-[9px] text-zinc-400 dark:text-slate-500 mt-0.5">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default function LandingPage() {
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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100 transition-colors">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-slate-950/80 border-b border-zinc-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <WroketLockup theme="auto" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
              className="text-xs font-medium text-zinc-500 dark:text-slate-400 hover:text-zinc-800 dark:hover:text-slate-200 transition-colors px-2 py-1 rounded"
            >
              {locale === "fr" ? "EN" : "FR"}
            </button>
            <button
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
              href="/pricing"
              className="text-sm font-medium text-zinc-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              {t("landing.navPricing")}
            </Link>
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

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-indigo-50 dark:from-emerald-950/20 dark:via-slate-950 dark:to-indigo-950/20" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-emerald-200/30 dark:bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-indigo-200/30 dark:bg-indigo-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Task management, reimagined</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
            {t("landing.heroTitle").split("\n").map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {i === 0 ? line : (
                  <span className="bg-gradient-to-r from-emerald-500 to-indigo-500 bg-clip-text text-transparent">{line}</span>
                )}
              </span>
            ))}
          </h1>

          <p className="text-lg sm:text-xl text-zinc-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t("landing.heroSub")}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white text-base font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40"
            >
              {t("landing.cta")}
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>

          {/* Mini visual */}
          <div className="mt-16 mx-auto max-w-3xl rounded-2xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-zinc-300/50 dark:shadow-black/30 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-100 dark:border-slate-800 bg-zinc-50 dark:bg-slate-800/50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-zinc-400 dark:text-slate-500 ml-2 font-mono">wroket.com</span>
            </div>
            <div className="p-6 space-y-3">
              {[
                { label: locale === "fr" ? "Lancer la campagne marketing" : "Launch marketing campaign", prio: locale === "fr" ? "Haute" : "High", color: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300", check: true, tag: "marketing", slot: locale === "fr" ? "Lun 09:00" : "Mon 09:00" },
                { label: locale === "fr" ? "Préparer la démo client" : "Prepare client demo", prio: locale === "fr" ? "Haute" : "High", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300", check: false, tag: null, slot: locale === "fr" ? "Mar 14:00" : "Tue 14:00" },
                { label: locale === "fr" ? "Refactorer le module auth" : "Refactor auth module", prio: locale === "fr" ? "Moyenne" : "Medium", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300", check: false, tag: "tech", slot: null },
                { label: locale === "fr" ? "Mettre à jour la documentation" : "Update documentation", prio: locale === "fr" ? "Basse" : "Low", color: "bg-zinc-100 dark:bg-slate-700 text-zinc-600 dark:text-slate-300", check: false, tag: null, slot: null },
              ].map((task) => (
                <div key={task.label} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-50 dark:bg-slate-800/50 border border-zinc-100 dark:border-slate-700/50">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${task.check ? "bg-emerald-500 border-emerald-500" : "border-zinc-300 dark:border-slate-600"}`}>
                    {task.check && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm flex-1 min-w-0 truncate text-left ${task.check ? "line-through text-zinc-400 dark:text-slate-500" : "text-zinc-700 dark:text-slate-200"}`}>
                    {task.label}
                  </span>
                  {task.tag && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 shrink-0">{task.tag}</span>
                  )}
                  {task.slot && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 shrink-0">{task.slot}</span>
                  )}
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 w-[72px] text-center ${task.color}`}>
                    {task.prio}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 bg-zinc-50 dark:bg-slate-900/50">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            {t("landing.featuresTitle")}
          </h2>
          <div className="w-16 h-1 bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full mx-auto mb-16" />

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

      {/* ── CTA final ── */}
      <section className="py-24">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center mx-auto mb-6">
            <WroketMark />
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t("landing.footerTag")}
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-500/25"
            >
              {t("landing.cta")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-100 dark:border-slate-800 py-8">
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
