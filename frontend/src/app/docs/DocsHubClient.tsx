"use client";

import { useLocale } from "@/lib/LocaleContext";

import { DocsHubCard } from "./_components/DocsPrerequisiteBanner";
import { DocsShell } from "./_components/DocsShell";
import { DOC_GUIDES } from "./_components/guideConfigs";

function GuideGrid({ guides }: { guides: typeof DOC_GUIDES }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
      {guides.map((guide) => (
        <DocsHubCard
          key={guide.id}
          titleKey={guide.hubTitleKey}
          summaryKey={guide.hubSummaryKey}
          href={guide.href}
          access={guide.access}
        />
      ))}
    </div>
  );
}

export function DocsHubClient() {
  const { t } = useLocale();
  const productGuides = DOC_GUIDES.filter((g) => g.category === "product");
  const integrationGuides = DOC_GUIDES.filter((g) => g.category === "integration");

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

      <section className="mb-12" aria-labelledby="docs-hub-product">
        <h2 id="docs-hub-product" className="text-xl font-semibold text-zinc-900 dark:text-slate-100 mb-4">
          {t("docs.hub.section.product")}
        </h2>
        <GuideGrid guides={productGuides} />
      </section>

      <section aria-labelledby="docs-hub-integrations">
        <h2 id="docs-hub-integrations" className="text-xl font-semibold text-zinc-900 dark:text-slate-100 mb-4">
          {t("docs.hub.section.integrations")}
        </h2>
        <GuideGrid guides={integrationGuides} />
      </section>
    </DocsShell>
  );
}
