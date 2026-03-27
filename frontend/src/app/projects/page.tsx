"use client";

import AppShell from "@/components/AppShell";
import { useLocale } from "@/lib/LocaleContext";

export default function ProjectsPage() {
  const { t } = useLocale();
  return (
    <AppShell>
      <div className="max-w-[1000px] space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("projects.title")}</h2>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("projects.subtitle")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
          <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-sm text-zinc-500 dark:text-slate-400">{t("projects.comingSoon")}</p>
        </div>
      </div>
    </AppShell>
  );
}
