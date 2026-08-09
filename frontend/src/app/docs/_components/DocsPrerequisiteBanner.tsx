"use client";

import Link from "next/link";

import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";

import type { DocAccessLevel } from "./guideConfigs";

type DocsPrerequisiteBannerProps = {
  access: DocAccessLevel;
};

export function DocsPrerequisiteBanner({ access }: DocsPrerequisiteBannerProps) {
  const { t } = useLocale();
  const { user, loading } = useAuth();

  if (loading) return null;

  const hasIntegrations = user?.entitlements?.integrations === true;
  const needsLogin = access !== "public" && !user;
  const needsTier = access === "smallTeams" && user && !hasIntegrations;

  if (!needsLogin && !needsTier) return null;

  if (needsLogin) {
    return (
      <div
        role="status"
        className="rounded-xl border border-teal-200/80 dark:border-teal-800/50 bg-teal-50/80 dark:bg-teal-950/30 px-4 py-4 sm:px-5"
      >
        <p className="font-semibold text-teal-950 dark:text-teal-100">{t("docs.banner.loginTitle")}</p>
        <p className="mt-1 text-sm text-teal-900/90 dark:text-teal-200/90">{t("docs.banner.loginBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="inline-flex rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {t("docs.banner.ctaLogin")}
          </Link>
          <Link
            href="/login?mode=register"
            className="inline-flex rounded-lg border border-teal-300 dark:border-teal-700 text-sm font-medium px-4 py-2 text-teal-900 dark:text-teal-200 hover:bg-teal-100/50 dark:hover:bg-teal-900/40 transition-colors"
          >
            {t("docs.banner.ctaRegister")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-4 sm:px-5"
    >
      <p className="font-semibold text-amber-950 dark:text-amber-100">{t("docs.banner.tierTitle")}</p>
      <p className="mt-1 text-sm text-amber-900/90 dark:text-amber-200/90">{t("docs.banner.tierBody")}</p>
      <Link
        href="/pricing"
        className="mt-3 inline-flex rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        {t("docs.banner.ctaPricing")}
      </Link>
    </div>
  );
}

export function DocsCtaRow({ items }: { items: Array<{ labelKey: TranslationKey; href: string }> }) {
  const { t } = useLocale();
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      {items.map((item) => (
        <Link
          key={item.href + item.labelKey}
          href={item.href}
          className="inline-flex rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </div>
  );
}

function tierLabelKey(access: DocAccessLevel): TranslationKey {
  if (access === "public") return "docs.tier.public";
  if (access === "authenticated") return "docs.tier.account";
  return "docs.tier.smallTeams";
}

export function DocsHubCard({
  titleKey,
  summaryKey,
  href,
  access,
}: {
  titleKey: TranslationKey;
  summaryKey: TranslationKey;
  href: string;
  access: DocAccessLevel;
}) {
  const { t } = useLocale();
  return (
    <article className="rounded-xl border border-stone-200 dark:border-stone-600/40 bg-white/80 dark:bg-stone-800/40 p-5 flex flex-col h-full hover:border-teal-600/50 dark:hover:border-teal-500/40 transition-colors shadow-[0_1px_0_rgba(28,25,23,0.04)]">
      <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50">{t(titleKey)}</h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-300 flex-1 leading-relaxed">{t(summaryKey)}</p>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-stone-500">
        {t(tierLabelKey(access))}
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline"
      >
        {t("docs.readGuide")} →
      </Link>
    </article>
  );
}
