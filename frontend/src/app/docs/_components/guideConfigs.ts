import type { TranslationKey } from "@/lib/i18n";

export type DocGuideId =
  | "premiers-pas"
  | "projects"
  | "donnees"
  | "settings"
  | "notion"
  | "monday"
  | "calendar"
  | "slack"
  | "teams"
  | "discord";

export type DocGuideCategory = "product" | "integration";

/** Who can read the full guide body (teaser always public for notion/monday). */
export type DocAccessLevel = "public" | "authenticated" | "smallTeams";

export interface DocGuideSection {
  id: string;
  titleKey: TranslationKey;
  paragraphKeys: TranslationKey[];
}

export interface DocGuideDefinition {
  id: DocGuideId;
  category: DocGuideCategory;
  href: string;
  hubTitleKey: TranslationKey;
  hubSummaryKey: TranslationKey;
  metaTitleKey: TranslationKey;
  summaryKey: TranslationKey;
  access: DocAccessLevel;
  /** Shown on public hub card */
  publicTeaser: boolean;
  lastUpdated: string;
  /** Optional « why use this » bullets (integrations). */
  benefitKeys?: TranslationKey[];
  prerequisiteKeys: TranslationKey[];
  sections: DocGuideSection[];
  troubleshooting: Array<{ titleKey: TranslationKey; bodyKey: TranslationKey }>;
  ctaHrefs: Array<{ labelKey: TranslationKey; href: string }>;
}

const PRODUCT_GUIDES: DocGuideDefinition[] = [
  {
    id: "premiers-pas",
    category: "product",
    href: "/docs/guides/premiers-pas",
    hubTitleKey: "docs.hub.premiersPas.title",
    hubSummaryKey: "docs.hub.premiersPas.summary",
    metaTitleKey: "docs.premiersPas.metaTitle",
    summaryKey: "docs.premiersPas.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    prerequisiteKeys: ["docs.premiersPas.prereq1"],
    sections: [
      {
        id: "task",
        titleKey: "docs.premiersPas.step1.title",
        paragraphKeys: ["docs.premiersPas.step1.p1", "docs.premiersPas.step1.p2"],
      },
      {
        id: "slot",
        titleKey: "docs.premiersPas.step2.title",
        paragraphKeys: ["docs.premiersPas.step2.p1", "docs.premiersPas.step2.p2"],
      },
      {
        id: "meeting",
        titleKey: "docs.premiersPas.step3.title",
        paragraphKeys: ["docs.premiersPas.step3.p1", "docs.premiersPas.step3.p2"],
      },
      {
        id: "note",
        titleKey: "docs.premiersPas.step4.title",
        paragraphKeys: ["docs.premiersPas.step4.p1", "docs.premiersPas.step4.p2"],
      },
      {
        id: "radar",
        titleKey: "docs.premiersPas.step5.title",
        paragraphKeys: ["docs.premiersPas.step5.p1"],
      },
    ],
    troubleshooting: [
      { titleKey: "docs.premiersPas.trouble1.title", bodyKey: "docs.premiersPas.trouble1.body" },
    ],
    ctaHrefs: [
      { labelKey: "docs.cta.todos", href: "/todos" },
      { labelKey: "docs.cta.agenda", href: "/agenda" },
    ],
  },
  {
    id: "projects",
    category: "product",
    href: "/docs/guides/projects",
    hubTitleKey: "docs.hub.projects.title",
    hubSummaryKey: "docs.hub.projects.summary",
    metaTitleKey: "docs.projects.metaTitle",
    summaryKey: "docs.projects.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    prerequisiteKeys: ["docs.projects.prereq1"],
    sections: [
      {
        id: "create",
        titleKey: "docs.projects.step1.title",
        paragraphKeys: ["docs.projects.step1.p1", "docs.projects.step1.p2"],
      },
      {
        id: "views",
        titleKey: "docs.projects.step2.title",
        paragraphKeys: ["docs.projects.step2.p1", "docs.projects.step2.p2"],
      },
      {
        id: "move",
        titleKey: "docs.projects.step3.title",
        paragraphKeys: ["docs.projects.step3.p1", "docs.projects.step3.p2"],
      },
      {
        id: "health",
        titleKey: "docs.projects.step4.title",
        paragraphKeys: ["docs.projects.step4.p1"],
      },
      {
        id: "import-share",
        titleKey: "docs.projects.step5.title",
        paragraphKeys: ["docs.projects.step5.p1", "docs.projects.step5.p2"],
      },
    ],
    troubleshooting: [
      { titleKey: "docs.projects.trouble1.title", bodyKey: "docs.projects.trouble1.body" },
    ],
    ctaHrefs: [{ labelKey: "docs.cta.projects", href: "/projects" }],
  },
  {
    id: "donnees",
    category: "product",
    href: "/docs/guides/donnees",
    hubTitleKey: "docs.hub.donnees.title",
    hubSummaryKey: "docs.hub.donnees.summary",
    metaTitleKey: "docs.donnees.metaTitle",
    summaryKey: "docs.donnees.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    prerequisiteKeys: ["docs.donnees.prereq1"],
    sections: [
      {
        id: "what-is-base",
        titleKey: "docs.donnees.step1.title",
        paragraphKeys: ["docs.donnees.step1.p1", "docs.donnees.step1.p2"],
      },
      {
        id: "bases-usage",
        titleKey: "docs.donnees.step2.title",
        paragraphKeys: ["docs.donnees.step2.p1", "docs.donnees.step2.p2"],
      },
      {
        id: "notes-editor",
        titleKey: "docs.donnees.step3.title",
        paragraphKeys: ["docs.donnees.step3.p1", "docs.donnees.step3.p2", "docs.donnees.step3.p3"],
      },
      {
        id: "actions",
        titleKey: "docs.donnees.step4.title",
        paragraphKeys: ["docs.donnees.step4.p1", "docs.donnees.step4.p2"],
      },
      {
        id: "folders-share",
        titleKey: "docs.donnees.step5.title",
        paragraphKeys: ["docs.donnees.step5.p1", "docs.donnees.step5.p2"],
      },
    ],
    troubleshooting: [
      { titleKey: "docs.donnees.trouble1.title", bodyKey: "docs.donnees.trouble1.body" },
    ],
    ctaHrefs: [
      { labelKey: "docs.cta.notes", href: "/notes" },
      { labelKey: "docs.cta.migrateNotionData", href: "/migrate/notion?mode=data" },
    ],
  },
  {
    id: "settings",
    category: "product",
    href: "/docs/guides/settings",
    hubTitleKey: "docs.hub.settings.title",
    hubSummaryKey: "docs.hub.settings.summary",
    metaTitleKey: "docs.settingsGuide.metaTitle",
    summaryKey: "docs.settingsGuide.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    benefitKeys: [
      "docs.settingsGuide.benefit1",
      "docs.settingsGuide.benefit2",
      "docs.settingsGuide.benefit3",
      "docs.settingsGuide.benefit4",
    ],
    prerequisiteKeys: ["docs.settingsGuide.prereq1"],
    sections: [
      {
        id: "profile-lang",
        titleKey: "docs.settingsGuide.step1.title",
        paragraphKeys: ["docs.settingsGuide.step1.p1", "docs.settingsGuide.step1.p2"],
      },
      {
        id: "security",
        titleKey: "docs.settingsGuide.step2.title",
        paragraphKeys: ["docs.settingsGuide.step2.p1", "docs.settingsGuide.step2.p2"],
      },
      {
        id: "tasks",
        titleKey: "docs.settingsGuide.step3.title",
        paragraphKeys: ["docs.settingsGuide.step3.p1", "docs.settingsGuide.step3.p2", "docs.settingsGuide.step3.p3"],
      },
      {
        id: "integrations",
        titleKey: "docs.settingsGuide.step4.title",
        paragraphKeys: [
          "docs.settingsGuide.step4.p1",
          "docs.settingsGuide.step4.p2",
          "docs.settingsGuide.step4.p3",
          "docs.settingsGuide.step4.p4",
        ],
      },
      {
        id: "subscription",
        titleKey: "docs.settingsGuide.step5.title",
        paragraphKeys: ["docs.settingsGuide.step5.p1"],
      },
      {
        id: "history",
        titleKey: "docs.settingsGuide.step6.title",
        paragraphKeys: ["docs.settingsGuide.step6.p1", "docs.settingsGuide.step6.p2"],
      },
    ],
    troubleshooting: [
      { titleKey: "docs.settingsGuide.trouble1.title", bodyKey: "docs.settingsGuide.trouble1.body" },
    ],
    ctaHrefs: [{ labelKey: "docs.cta.settings", href: "/settings" }],
  },
];

const INTEGRATION_GUIDES: DocGuideDefinition[] = [
  {
    id: "notion",
    category: "integration",
    href: "/docs/integrations/notion",
    hubTitleKey: "docs.hub.notion.title",
    hubSummaryKey: "docs.hub.notion.summary",
    metaTitleKey: "docs.notion.metaTitle",
    summaryKey: "docs.notion.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    benefitKeys: [
      "docs.notion.benefit1",
      "docs.notion.benefit2",
      "docs.notion.benefit3",
      "docs.notion.benefit4",
    ],
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
        paragraphKeys: ["docs.notion.step4.p1"],
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
    category: "integration",
    href: "/docs/integrations/monday",
    hubTitleKey: "docs.hub.monday.title",
    hubSummaryKey: "docs.hub.monday.summary",
    metaTitleKey: "docs.monday.metaTitle",
    summaryKey: "docs.monday.summary",
    access: "public",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    benefitKeys: [
      "docs.monday.benefit1",
      "docs.monday.benefit2",
      "docs.monday.benefit3",
      "docs.monday.benefit4",
    ],
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
    category: "integration",
    href: "/docs/integrations/calendar",
    hubTitleKey: "docs.hub.calendar.title",
    hubSummaryKey: "docs.hub.calendar.summary",
    metaTitleKey: "docs.calendar.metaTitle",
    summaryKey: "docs.calendar.summary",
    access: "smallTeams",
    publicTeaser: true,
    lastUpdated: "2026-06-17",
    benefitKeys: [
      "docs.calendar.benefit1",
      "docs.calendar.benefit2",
      "docs.calendar.benefit3",
      "docs.calendar.benefit4",
    ],
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
    category: "integration",
    href: "/docs/integrations/slack",
    hubTitleKey: "docs.hub.slack.title",
    hubSummaryKey: "docs.hub.slack.summary",
    metaTitleKey: "docs.slack.metaTitle",
    summaryKey: "docs.slack.summary",
    access: "smallTeams",
    publicTeaser: false,
    lastUpdated: "2026-06-17",
    benefitKeys: ["docs.slack.benefit1", "docs.slack.benefit2", "docs.slack.benefit3"],
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
    category: "integration",
    href: "/docs/integrations/teams",
    hubTitleKey: "docs.hub.teams.title",
    hubSummaryKey: "docs.hub.teams.summary",
    metaTitleKey: "docs.teams.metaTitle",
    summaryKey: "docs.teams.summary",
    access: "smallTeams",
    publicTeaser: false,
    lastUpdated: "2026-06-17",
    benefitKeys: ["docs.teams.benefit1", "docs.teams.benefit2", "docs.teams.benefit3"],
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
    category: "integration",
    href: "/docs/integrations/discord",
    hubTitleKey: "docs.hub.discord.title",
    hubSummaryKey: "docs.hub.discord.summary",
    metaTitleKey: "docs.discord.metaTitle",
    summaryKey: "docs.discord.summary",
    access: "smallTeams",
    publicTeaser: false,
    lastUpdated: "2026-06-17",
    benefitKeys: ["docs.discord.benefit1", "docs.discord.benefit2", "docs.discord.benefit3"],
    prerequisiteKeys: ["docs.discord.prereq1"],
    sections: [
      { id: "webhook", titleKey: "docs.discord.step1.title", paragraphKeys: ["docs.discord.step1.p1"] },
      { id: "wroket", titleKey: "docs.discord.step2.title", paragraphKeys: ["docs.discord.step2.p1"] },
    ],
    troubleshooting: [],
    ctaHrefs: [{ labelKey: "docs.banner.ctaSettings", href: "/settings?tab=integrations" }],
  },
];

export const DOC_GUIDES: DocGuideDefinition[] = [...PRODUCT_GUIDES, ...INTEGRATION_GUIDES];

export function getDocGuide(id: string): DocGuideDefinition | undefined {
  return DOC_GUIDES.find((g) => g.id === id);
}

export const DOC_PRODUCT_GUIDE_SLUGS = PRODUCT_GUIDES.map((g) => g.id);
export const DOC_INTEGRATION_GUIDE_SLUGS = INTEGRATION_GUIDES.map((g) => g.id);
/** @deprecated Use DOC_INTEGRATION_GUIDE_SLUGS */
export const DOC_GUIDE_SLUGS = DOC_INTEGRATION_GUIDE_SLUGS;
