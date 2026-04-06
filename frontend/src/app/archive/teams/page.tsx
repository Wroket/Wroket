"use client";

import AppShell from "@/components/AppShell";
import { useLocale } from "@/lib/LocaleContext";

export default function ArchiveTeamsPage() {
  const { t } = useLocale();

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.teamsSection")}</h1>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.teamsIntro")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
          <p className="text-sm text-zinc-400 dark:text-slate-500 italic">{t("archives.teamsEmpty")}</p>
        </div>
      </div>
    </AppShell>
  );
}
