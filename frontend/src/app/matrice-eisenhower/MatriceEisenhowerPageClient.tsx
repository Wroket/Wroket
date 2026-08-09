"use client";

import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { EisenhowerProductMock } from "@/components/marketing/MarketingProductMocks";
import { useLocale } from "@/lib/LocaleContext";

const SECTIONS = [
  {
    titleKey: "marketing.eisenhower.s1.title" as const,
    paragraphKeys: ["marketing.eisenhower.s1.p1" as const],
  },
  {
    titleKey: "marketing.eisenhower.s2.title" as const,
    paragraphKeys: ["marketing.eisenhower.s2.p1" as const],
  },
  {
    titleKey: "marketing.eisenhower.s3.title" as const,
    paragraphKeys: ["marketing.eisenhower.s3.p1" as const],
  },
  {
    titleKey: "marketing.eisenhower.s4.title" as const,
    paragraphKeys: ["marketing.eisenhower.s4.p1" as const],
  },
];

export default function MatriceEisenhowerPageClient() {
  const { locale } = useLocale();
  return (
    <MarketingPageShell
      h1Key="marketing.eisenhower.h1"
      introKey="marketing.eisenhower.intro"
      sections={SECTIONS}
      visual={<EisenhowerProductMock fr={locale === "fr"} />}
      relatedLinks={[
        { href: "/agenda-taches", labelKey: "landing.footerAgendaTasks" },
        { href: "/gestion-taches-equipe", labelKey: "landing.footerTeamTasks" },
      ]}
    />
  );
}
