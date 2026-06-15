"use client";

import { useLocale } from "@/lib/LocaleContext";

import { DocsHubCard } from "./_components/DocsPrerequisiteBanner";
import { DocsShell } from "./_components/DocsShell";
import { DOC_GUIDES } from "./_components/guideConfigs";

export function DocsHubClient() {
  const { t } = useLocale();

  return (
    <DocsShell>
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-slate-50">
          {t("docs.title")}
        </h1>
        <p className="mt-3 text-lg text-zinc-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          {t("docs.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        {DOC_GUIDES.map((guide) => (
          <DocsHubCard
            key={guide.id}
            titleKey={guide.hubTitleKey}
            summaryKey={guide.hubSummaryKey}
            href={guide.href}
            access={guide.access}
          />
        ))}
      </div>
    </DocsShell>
  );
}
