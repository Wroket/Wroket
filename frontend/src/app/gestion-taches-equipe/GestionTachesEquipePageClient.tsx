"use client";

import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { TeamProductMock } from "@/components/marketing/MarketingProductMocks";
import { useLocale } from "@/lib/LocaleContext";

const SECTIONS = [
  {
    titleKey: "marketing.team.s1.title" as const,
    paragraphKeys: ["marketing.team.s1.p1" as const],
  },
  {
    titleKey: "marketing.team.s2.title" as const,
    paragraphKeys: ["marketing.team.s2.p1" as const],
  },
  {
    titleKey: "marketing.team.s3.title" as const,
    paragraphKeys: ["marketing.team.s3.p1" as const],
  },
  {
    titleKey: "marketing.team.s4.title" as const,
    paragraphKeys: ["marketing.team.s4.p1" as const],
  },
];

export default function GestionTachesEquipePageClient() {
  const { locale } = useLocale();
  return (
    <MarketingPageShell
      h1Key="marketing.team.h1"
      introKey="marketing.team.intro"
      sections={SECTIONS}
      visual={<TeamProductMock fr={locale === "fr"} />}
      relatedLinks={[
        { href: "/agenda-taches", labelKey: "landing.footerAgendaTasks" },
        { href: "/matrice-eisenhower", labelKey: "landing.footerEisenhower" },
      ]}
    />
  );
}
