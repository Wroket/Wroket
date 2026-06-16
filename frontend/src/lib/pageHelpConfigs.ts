import type { TranslationKey } from "./i18n";

export type PageHelpId =
  | "dashboard"
  | "todos"
  | "todos.radar"
  | "projects.list"
  | "projects.detail"
  | "notes.hub"
  | "notes.editor"
  | "notes.databases"
  | "agenda"
  | "agenda.manage"
  | "settings"
  | "collaboration.hub"
  | "collaboration.collaborators"
  | "collaboration.teams"
  | "collaboration.contacts"
  | "teamDashboard"
  | "teamPortfolio"
  | "notifications";

type PageHelpConfig = {
  titleKey: TranslationKey;
  itemKeys: TranslationKey[];
};

export const PAGE_HELP: Record<PageHelpId, PageHelpConfig> = {
  dashboard: {
    titleKey: "dashboard.title",
    itemKeys: [
      "help.page.dashboard.1",
      "help.page.dashboard.2",
      "help.page.dashboard.3",
      "help.page.dashboard.4",
    ],
  },
  todos: {
    titleKey: "todos.listTitle",
    itemKeys: [
      "help.page.todos.1",
      "help.page.todos.2",
      "help.page.todos.3",
      "help.page.todos.4",
    ],
  },
  "todos.radar": {
    titleKey: "todos.matrixTitle",
    itemKeys: [
      "help.page.todos.radar.1",
      "help.page.todos.radar.2",
      "help.page.todos.radar.3",
      "help.page.todos.radar.4",
    ],
  },
  "projects.list": {
    titleKey: "projects.title",
    itemKeys: [
      "help.page.projects.list.1",
      "help.page.projects.list.2",
      "help.page.projects.list.3",
      "help.page.projects.list.4",
    ],
  },
  "projects.detail": {
    titleKey: "projects.helpTitle",
    itemKeys: [
      "help.page.projects.detail.1",
      "help.page.projects.detail.2",
      "help.page.projects.detail.3",
      "help.page.projects.detail.4",
    ],
  },
  "notes.hub": {
    titleKey: "notes.title",
    itemKeys: [
      "help.page.notes.hub.1",
      "help.page.notes.hub.2",
      "help.page.notes.hub.3",
    ],
  },
  "notes.editor": {
    titleKey: "notes.title",
    itemKeys: [
      "help.page.notes.editor.1",
      "help.page.notes.editor.2",
      "help.page.notes.editor.3",
    ],
  },
  "notes.databases": {
    titleKey: "notes.databases.sectionPath",
    itemKeys: [
      "help.page.notes.databases.1",
      "help.page.notes.databases.2",
      "help.page.notes.databases.3",
    ],
  },
  agenda: {
    titleKey: "agenda.title",
    itemKeys: [
      "help.page.agenda.1",
      "help.page.agenda.2",
      "help.page.agenda.3",
      "help.page.agenda.4",
    ],
  },
  "agenda.manage": {
    titleKey: "agenda.manageCalendars",
    itemKeys: [
      "help.page.agenda.manage.1",
      "help.page.agenda.manage.2",
      "help.page.agenda.manage.3",
    ],
  },
  settings: {
    titleKey: "settings.title",
    itemKeys: [
      "help.page.settings.1",
      "help.page.settings.2",
      "help.page.settings.3",
      "help.page.settings.4",
      "help.page.settings.5",
    ],
  },
  "collaboration.hub": {
    titleKey: "teams.title",
    itemKeys: [
      "help.page.collaboration.hub.1",
      "help.page.collaboration.hub.2",
      "help.page.collaboration.hub.3",
    ],
  },
  "collaboration.collaborators": {
    titleKey: "teams.collaborators",
    itemKeys: [
      "help.page.collaboration.collaborators.1",
      "help.page.collaboration.collaborators.2",
      "help.page.collaboration.collaborators.3",
    ],
  },
  "collaboration.teams": {
    titleKey: "teams.teamsList",
    itemKeys: [
      "help.page.collaboration.teams.1",
      "help.page.collaboration.teams.2",
      "help.page.collaboration.teams.3",
    ],
  },
  "collaboration.contacts": {
    titleKey: "contacts.title",
    itemKeys: [
      "help.page.collaboration.contacts.1",
      "help.page.collaboration.contacts.2",
      "help.page.collaboration.contacts.3",
    ],
  },
  teamDashboard: {
    titleKey: "teamDash.title",
    itemKeys: [
      "help.page.teamDashboard.1",
      "help.page.teamDashboard.2",
      "help.page.teamDashboard.3",
    ],
  },
  teamPortfolio: {
    titleKey: "portfolio.title",
    itemKeys: [
      "help.page.teamPortfolio.1",
      "help.page.teamPortfolio.2",
    ],
  },
  notifications: {
    titleKey: "notif.pageTitle",
    itemKeys: [
      "help.page.notifications.1",
      "help.page.notifications.2",
      "help.page.notifications.3",
    ],
  },
};
