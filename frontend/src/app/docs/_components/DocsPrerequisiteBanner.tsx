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
        className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-4 sm:px-5"
      >
        <p className="font-semibold text-indigo-950 dark:text-indigo-100">{t("docs.banner.loginTitle")}</p>
        <p className="mt-1 text-sm text-indigo-900/90 dark:text-indigo-200/90">{t("docs.banner.loginBody")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/login"
            className="inline-flex rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {t("docs.banner.ctaLogin")}
          </Link>
          <Link
            href="/register"
            className="inline-flex rounded-lg border border-indigo-300 dark:border-indigo-700 text-sm font-medium px-4 py-2 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 transition-colors"
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
      className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-4 sm:px-5"
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
          className="inline-flex rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white text-sm font-medium px-4 py-2 transition-colors"
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
    <article className="rounded-xl border border-zinc-200 dark:border-slate-700 bg-zinc-50/50 dark:bg-slate-900/40 p-5 flex flex-col h-full hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t(titleKey)}</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-slate-400 flex-1 leading-relaxed">{t(summaryKey)}</p>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-slate-500">
        {t(tierLabelKey(access))}
      </p>
      <Link
        href={href}
        className="mt-4 inline-flex text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
      >
        {t("docs.readGuide")} →
      </Link>
    </article>
  );
}
