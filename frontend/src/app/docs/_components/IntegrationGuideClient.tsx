"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";

import { DocsCtaRow, DocsPrerequisiteBanner } from "./DocsPrerequisiteBanner";
import { DocsShell } from "./DocsShell";
import type { DocGuideDefinition } from "./guideConfigs";

type IntegrationGuideClientProps = {
  guide: DocGuideDefinition;
  /** Optional hash section id to scroll into view (e.g. template) */
  focusSectionId?: string;
};

function canReadFullGuide(
  guide: DocGuideDefinition,
  user: ReturnType<typeof useAuth>["user"],
): boolean {
  if (guide.access === "public") return true;
  if (!user) return false;
  if (guide.access === "authenticated") return true;
  return user.entitlements?.integrations === true;
}

export function IntegrationGuideClient({ guide, focusSectionId }: IntegrationGuideClientProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const fullAccess = canReadFullGuide(guide, user);

  useEffect(() => {
    if (!focusSectionId) return;
    const el = document.getElementById(focusSectionId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSectionId]);

  return (
    <DocsShell>
      <Link
        href="/docs"
        className="text-sm text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
      >
        {t("docs.backToHub")}
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-slate-50">
          {t(guide.metaTitleKey)}
        </h1>
        <p className="mt-3 text-base text-zinc-600 dark:text-slate-400 leading-relaxed max-w-2xl">
          {t(guide.summaryKey)}
        </p>
        <p className="mt-2 text-xs text-zinc-400 dark:text-slate-500">
          {t("docs.lastUpdated")} : {guide.lastUpdated}
        </p>
      </header>

      <div className="space-y-10">
        <DocsPrerequisiteBanner access={guide.access} />

        {guide.benefitKeys && guide.benefitKeys.length > 0 && (
          <section aria-labelledby="docs-benefits-heading">
            <h2 id="docs-benefits-heading" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
              {t("docs.section.benefits")}
            </h2>
            <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-zinc-700 dark:text-slate-300">
              {guide.benefitKeys.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </section>
        )}

        {guide.prerequisiteKeys.length > 0 && (
        <section aria-labelledby="docs-prereq-heading">
          <h2 id="docs-prereq-heading" className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
            {t("docs.section.prerequisites")}
          </h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-zinc-700 dark:text-slate-300">
            {guide.prerequisiteKeys.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </section>
        )}

        {fullAccess ? (
          <>
            <section aria-labelledby="docs-steps-heading">
              <h2 id="docs-steps-heading" className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-6">
                {t("docs.section.steps")}
              </h2>
              <ol className="space-y-8">
                {guide.sections.map((section, index) => (
                  <li key={section.id} id={section.id} className="scroll-mt-24">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-slate-100">
                      <span className="text-emerald-600 dark:text-emerald-400 mr-2">{index + 1}.</span>
                      {t(section.titleKey)}
                    </h3>
                    <div className="mt-2 space-y-2 text-sm text-zinc-700 dark:text-slate-300 leading-relaxed">
                      {section.paragraphKeys.map((pk) => (
                        <p key={pk}>{t(pk)}</p>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {guide.troubleshooting.length > 0 && (
              <section aria-labelledby="docs-trouble-heading">
                <h2 id="docs-trouble-heading" className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-4">
                  {t("docs.section.troubleshooting")}
                </h2>
                <dl className="space-y-4">
                  {guide.troubleshooting.map((item) => (
                    <div
                      key={item.titleKey}
                      className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4"
                    >
                      <dt className="font-medium text-zinc-900 dark:text-slate-100">{t(item.titleKey)}</dt>
                      <dd className="mt-1 text-sm text-zinc-600 dark:text-slate-400">{t(item.bodyKey)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <DocsCtaRow items={guide.ctaHrefs} />
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-slate-400 italic">
            {guide.publicTeaser
              ? t("docs.banner.loginBody")
              : t("docs.banner.tierBody")}
          </p>
        )}
      </div>
    </DocsShell>
  );
}
