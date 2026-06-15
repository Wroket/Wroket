import type { TranslationKey } from "@/lib/i18n";

export type DocGuideId = "notion" | "monday" | "calendar" | "slack" | "teams" | "discord";

/** Who can read the full guide body (teaser always public for notion/monday). */
export type DocAccessLevel = "public" | "authenticated" | "smallTeams";

export interface DocGuideSection {
  id: string;
  titleKey: TranslationKey;
  paragraphKeys: TranslationKey[];
}

export interface DocGuideDefinition {
  id: DocGuideId;
  href: string;
  hubTitleKey: TranslationKey;
  hubSummaryKey: TranslationKey;
  metaTitleKey: TranslationKey;
  summaryKey: TranslationKey;
  access: DocAccessLevel;
  /** Shown on public hub card */
  publicTeaser: boolean;
  lastUpdated: string;
  prerequisiteKeys: TranslationKey[];
  sections: DocGuideSection[];
  troubleshooting: Array<{ titleKey: TranslationKey; bodyKey: TranslationKey }>;
  ctaHrefs: Array<{ labelKey: TranslationKey; href: string }>;
}

export const DOC_GUIDES: DocGuideDefinition[] = [
  {
    id: "notion",
    href: "/docs/integrations/notion",
    hubTitleKey: "docs.hub.notion.title",
    hubSummaryKey: "docs.hub.notion.summary",
    metaTitleKey: "docs.notion.metaTitle",
    summaryKey: "docs.notion.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-15",
    prerequisiteKeys: ["docs.notion.prereq1", "docs.notion.prereq2", "docs.notion.prereq3"],
    sections: [
      {
        id: "connect",
        titleKey: "docs.notion.step1.title",
        paragraphKeys: ["docs.notion.step1.p1"],
      },
      {
        id: "type",
        titleKey: "docs.notion.step2.title",
        paragraphKeys: ["docs.notion.step2.p1", "docs.notion.step2.p2"],
      },
      {
        id: "template",
        titleKey: "docs.notion.step3.title",
        paragraphKeys: ["docs.notion.step3.p1", "docs.notion.step3.p2"],
      },
      {
        id: "import",
        titleKey: "docs.notion.step4.title",
        paragraphKeys: ["docs.notion.step4.p1", "docs.notion.step4.p2"],
      },
    ],
    troubleshooting: [
      { titleKey: "docs.notion.trouble1.title", bodyKey: "docs.notion.trouble1.body" },
      { titleKey: "docs.notion.trouble2.title", bodyKey: "docs.notion.trouble2.body" },
    ],
    ctaHrefs: [
      { labelKey: "docs.banner.ctaSettings", href: "/settings?tab=integrations" },
      { labelKey: "docs.cta.migrateNotion", href: "/migrate/notion" },
    ],
  },
  {
    id: "monday",
    href: "/docs/integrations/monday",
    hubTitleKey: "docs.hub.monday.title",
    hubSummaryKey: "docs.hub.monday.summary",
    metaTitleKey: "docs.monday.metaTitle",
    summaryKey: "docs.monday.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-15",
    prerequisiteKeys: ["docs.monday.prereq1", "docs.monday.prereq2"],
    sections: [
      { id: "connect", titleKey: "docs.monday.step1.title", paragraphKeys: ["docs.monday.step1.p1"] },
      { id: "target", titleKey: "docs.monday.step2.title", paragraphKeys: ["docs.monday.step2.p1"] },
      { id: "preview", titleKey: "docs.monday.step3.title", paragraphKeys: ["docs.monday.step3.p1"] },
    ],
    troubleshooting: [{ titleKey: "docs.monday.trouble1.title", bodyKey: "docs.monday.trouble1.body" }],
    ctaHrefs: [
      { labelKey: "docs.banner.ctaSettings", href: "/settings?tab=integrations" },
      { labelKey: "docs.cta.migrateMonday", href: "/migrate/monday" },
    ],
  },
  {
    id: "calendar",
    href: "/docs/integrations/calendar",
    hubTitleKey: "docs.hub.calendar.title",
    hubSummaryKey: "docs.hub.calendar.summary",
    metaTitleKey: "docs.calendar.metaTitle",
    summaryKey: "docs.calendar.summary",
    access: "smallTeams",
    publicTeaser: true,
    lastUpdated: "2026-06-15",
    prerequisiteKeys: ["docs.calendar.prereq1", "docs.calendar.prereq2"],
    sections: [
      { id: "connect", titleKey: "docs.calendar.step1.title", paragraphKeys: ["docs.calendar.step1.p1"] },
      { id: "select", titleKey: "docs.calendar.step2.title", paragraphKeys: ["docs.calendar.step2.p1"] },
      { id: "preferred", titleKey: "docs.calendar.step3.title", paragraphKeys: ["docs.calendar.step3.p1"] },
      { id: "book", titleKey: "docs.calendar.step4.title", paragraphKeys: ["docs.calendar.step4.p1"] },
    ],
    troubleshooting: [{ titleKey: "docs.calendar.trouble1.title", bodyKey: "docs.calendar.trouble1.body" }],
    ctaHrefs: [
      { labelKey: "docs.cta.agendaManage", href: "/agenda/manage" },
      { labelKey: "docs.banner.ctaPricing", href: "/pricing" },
    ],
  },
  {
    id: "slack",
    href: "/docs/integrations/slack",
    hubTitleKey: "docs.hub.slack.title",
    hubSummaryKey: "docs.hub.slack.summary",
    metaTitleKey: "docs.slack.metaTitle",
    summaryKey: "docs.slack.summary",
    access: "smallTeams",
    publicTeaser: false,
    lastUpdated: "2026-06-15",
    prerequisiteKeys: ["docs.slack.prereq1"],
    sections: [
      { id: "webhook", titleKey: "docs.slack.step1.title", paragraphKeys: ["docs.slack.step1.p1"] },
      { id: "wroket", titleKey: "docs.slack.step2.title", paragraphKeys: ["docs.slack.step2.p1"] },
    ],
    troubleshooting: [],
    ctaHrefs: [{ labelKey: "docs.banner.ctaSettings", href: "/settings?tab=integrations" }],
  },
  {
    id: "teams",
    href: "/docs/integrations/teams",
    hubTitleKey: "docs.hub.teams.title",
    hubSummaryKey: "docs.hub.teams.summary",
    metaTitleKey: "docs.teams.metaTitle",
    summaryKey: "docs.teams.summary",
    access: "smallTeams",
    publicTeaser: false,
    lastUpdated: "2026-06-15",
    prerequisiteKeys: ["docs.teams.prereq1"],
    sections: [
      { id: "webhook", titleKey: "docs.teams.step1.title", paragraphKeys: ["docs.teams.step1.p1"] },
      { id: "wroket", titleKey: "docs.teams.step2.title", paragraphKeys: ["docs.teams.step2.p1"] },
    ],
    troubleshooting: [],
    ctaHrefs: [{ labelKey: "docs.banner.ctaSettings", href: "/settings?tab=integrations" }],
  },
  {
    id: "discord",
    href: "/docs/integrations/discord",
    hubTitleKey: "docs.hub.discord.title",
    hubSummaryKey: "docs.hub.discord.summary",
    metaTitleKey: "docs.discord.metaTitle",
    summaryKey: "docs.discord.summary",
    access: "smallTeams",
    publicTeaser: false,
    lastUpdated: "2026-06-15",
    prerequisiteKeys: ["docs.discord.prereq1"],
    sections: [
      { id: "webhook", titleKey: "docs.discord.step1.title", paragraphKeys: ["docs.discord.step1.p1"] },
      { id: "wroket", titleKey: "docs.discord.step2.title", paragraphKeys: ["docs.discord.step2.p1"] },
    ],
    troubleshooting: [],
    ctaHrefs: [{ labelKey: "docs.banner.ctaSettings", href: "/settings?tab=integrations" }],
  },
];

export function getDocGuide(id: string): DocGuideDefinition | undefined {
  return DOC_GUIDES.find((g) => g.id === id);
}

export const DOC_GUIDE_SLUGS = DOC_GUIDES.map((g) => g.id);
