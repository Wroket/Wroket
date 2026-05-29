"use client";

import { MarketingArticle, MarketingPageShell } from "@/components/marketing/MarketingPageShell";

const SECTIONS = [
  {
    titleKey: "marketing.agenda.s1.title" as const,
    paragraphKeys: ["marketing.agenda.s1.p1" as const],
  },
  {
    titleKey: "marketing.agenda.s2.title" as const,
    paragraphKeys: ["marketing.agenda.s2.p1" as const],
  },
  {
    titleKey: "marketing.agenda.s3.title" as const,
    paragraphKeys: ["marketing.agenda.s3.p1" as const],
  },
  {
    titleKey: "marketing.agenda.s4.title" as const,
    paragraphKeys: ["marketing.agenda.s4.p1" as const],
  },
];

export default function AgendaTachesPageClient() {
  return (
    <MarketingPageShell
      relatedLinks={[
        { href: "/gestion-taches-equipe", labelKey: "landing.footerTeamTasks" },
        { href: "/matrice-eisenhower", labelKey: "landing.footerEisenhower" },
      ]}
    >
      <MarketingArticle
        h1Key="marketing.agenda.h1"
        introKey="marketing.agenda.intro"
        sections={SECTIONS}
      />
    </MarketingPageShell>
  );
}
