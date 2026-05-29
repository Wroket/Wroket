"use client";

import { MarketingArticle, MarketingPageShell } from "@/components/marketing/MarketingPageShell";

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
  return (
    <MarketingPageShell
      relatedLinks={[
        { href: "/agenda-taches", labelKey: "landing.footerAgendaTasks" },
        { href: "/matrice-eisenhower", labelKey: "landing.footerEisenhower" },
      ]}
    >
      <MarketingArticle
        h1Key="marketing.team.h1"
        introKey="marketing.team.intro"
        sections={SECTIONS}
      />
    </MarketingPageShell>
  );
}
