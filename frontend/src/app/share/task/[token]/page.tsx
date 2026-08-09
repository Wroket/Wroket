"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { WroketLockup } from "@/components/brand/WroketBrand";
import { useLocale } from "@/lib/LocaleContext";
import { getSharedTask, type SharedTaskView } from "@/lib/api/taskShare";

export default function SharedTaskPage() {
  const { t, locale } = useLocale();
  const params = useParams();
  const token = typeof params?.token === "string" ? decodeURIComponent(params.token) : "";
  const [view, setView] = useState<SharedTaskView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getSharedTask(token);
        if (!cancelled) setView(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("share.invalidLink"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "fr-FR");
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header className="border-b border-zinc-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <WroketLockup />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            {t("taskShare.publicBadge")}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-center text-sm text-red-600 dark:text-red-400 py-12">{error}</p>
        )}
        {!loading && !error && view && (
          <article className="rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h1 className="text-xl font-bold leading-snug">{view.title}</h1>
            {view.projectName && (
              <p className="text-sm text-zinc-500 dark:text-slate-400">{view.projectName}</p>
            )}
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-zinc-400">{t("taskShare.status")}</dt>
                <dd className="font-medium mt-0.5">{view.status}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-zinc-400">{t("taskShare.priority")}</dt>
                <dd className="font-medium mt-0.5">{view.priority}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-zinc-400">{t("taskShare.phase")}</dt>
                <dd className="font-medium mt-0.5">{view.phaseName || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-zinc-400">{t("taskShare.deadline")}</dt>
                <dd className="font-medium mt-0.5">{fmt(view.deadline)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-zinc-400">{t("taskShare.start")}</dt>
                <dd className="font-medium mt-0.5">{fmt(view.startDate)}</dd>
              </div>
            </dl>
            {view.summary ? (
              <p className="text-sm text-zinc-600 dark:text-slate-300 border-t border-zinc-100 dark:border-slate-800 pt-3">
                {view.summary}
              </p>
            ) : null}
            {view.expiresAt && (
              <p className="text-[11px] text-zinc-400 text-center pt-2">
                {t("share.expiresAt")} {fmt(view.expiresAt)}
              </p>
            )}
          </article>
        )}
      </main>
    </div>
  );
}
