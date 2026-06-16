/**
 * User-facing integration documentation (FR/EN).
 * Editorial source: docs/contacts-notion-v1.md, docs/donnees-notion-v1.md, docs/monday-docs-v1.md
 */
export const docsTranslations = {
  "docs.title": { fr: "Documentation", en: "Documentation" },
  "docs.subtitle": {
    fr: "Guides pour connecter Notion, Monday, vos calendriers et les notifications d'équipe.",
    en: "Guides to connect Notion, Monday, your calendars, and team notifications.",
  },
  "docs.metaDescription": {
    fr: "Guides d'intégration Wroket : migrer depuis Notion ou Monday, connecter Google Calendar ou Outlook, configurer Slack et Teams.",
    en: "Wroket integration guides: migrate from Notion or Monday, connect Google Calendar or Outlook, set up Slack and Teams.",
  },
  "docs.backToHub": { fr: "← Tous les guides", en: "← All guides" },
  "docs.lastUpdated": { fr: "Dernière mise à jour", en: "Last updated" },
  "docs.readGuide": { fr: "Lire le guide", en: "Read guide" },
  "docs.section.prerequisites": { fr: "Prérequis", en: "Prerequisites" },
  "docs.section.steps": { fr: "Étapes", en: "Steps" },
  "docs.section.troubleshooting": { fr: "Dépannage", en: "Troubleshooting" },
  "docs.section.onThisPage": { fr: "Sur cette page", en: "On this page" },
  "docs.tier.public": { fr: "Accessible sans compte", en: "Available without an account" },
  "docs.tier.account": { fr: "Compte requis", en: "Account required" },
  "docs.tier.smallTeams": { fr: "Palier Small teams ou supérieur", en: "Small teams plan or higher" },
  "docs.banner.loginTitle": { fr: "Connectez-vous pour la suite du guide", en: "Sign in to read the full guide" },
  "docs.banner.loginBody": {
    fr: "La configuration OAuth et les webhooks se font depuis votre compte Wroket.",
    en: "OAuth setup and webhooks are configured from your Wroket account.",
  },
  "docs.banner.tierTitle": { fr: "Palier Small teams requis", en: "Small teams plan required" },
  "docs.banner.tierBody": {
    fr: "Les intégrations externes (Notion, Monday, calendriers avancés, webhooks) sont incluses à partir du palier Small teams.",
    en: "External integrations (Notion, Monday, advanced calendars, webhooks) are included from the Small teams plan.",
  },
  "docs.banner.ctaLogin": { fr: "Se connecter", en: "Sign in" },
  "docs.banner.ctaRegister": { fr: "Créer un compte", en: "Create account" },
  "docs.banner.ctaPricing": { fr: "Voir les tarifs", en: "View pricing" },
  "docs.banner.ctaSettings": { fr: "Ouvrir Paramètres › Intégrations", en: "Open Settings › Integrations" },
  "docs.cta.migrateNotion": { fr: "Lancer l'import Notion", en: "Start Notion import" },
  "docs.cta.migrateMonday": { fr: "Lancer l'import Monday", en: "Start Monday import" },
  "docs.cta.agendaManage": { fr: "Gérer mes calendriers", en: "Manage my calendars" },
  "docs.footer.resources": { fr: "Ressources", en: "Resources" },
  "docs.footer.documentation": { fr: "Documentation", en: "Documentation" },

  "docs.hub.notion.title": { fr: "Notion", en: "Notion" },
  "docs.hub.notion.summary": {
    fr: "Connexion OAuth, choix du type de base (projet, contacts, données), import ZIP ou API.",
    en: "OAuth connection, database type (project, contacts, data), ZIP or API import.",
  },
  "docs.hub.monday.title": { fr: "Monday.com", en: "Monday.com" },
  "docs.hub.monday.summary": {
    fr: "Boards → projets, tableaux → bases, docs → notes. Reconnexion si scope docs manquant.",
    en: "Boards → projects, boards with tables → databases, docs → notes. Reconnect if docs scope is missing.",
  },
  "docs.hub.calendar.title": { fr: "Calendrier Google & Outlook", en: "Google Calendar & Outlook" },
  "docs.hub.calendar.summary": {
    fr: "Connecter plusieurs agendas, compte prioritaire pour les réservations, Meet et Teams.",
    en: "Connect multiple calendars, preferred account for bookings, Meet and Teams.",
  },
  "docs.hub.slack.title": { fr: "Slack", en: "Slack" },
  "docs.hub.slack.summary": {
    fr: "Webhook entrant pour les événements tâches et digests.",
    en: "Incoming webhook for task events and digests.",
  },
  "docs.hub.teams.title": { fr: "Microsoft Teams", en: "Microsoft Teams" },
  "docs.hub.teams.summary": {
    fr: "Notifications via webhook entrant ou Power Automate.",
    en: "Notifications via incoming webhook or Power Automate.",
  },
  "docs.hub.discord.title": { fr: "Discord", en: "Discord" },
  "docs.hub.discord.summary": {
    fr: "Webhook avancé pour les événements sélectionnés.",
    en: "Advanced webhook for selected events.",
  },

  "docs.notion.metaTitle": { fr: "Guide Notion", en: "Notion guide" },
  "docs.notion.summary": {
    fr: "Importez vos bases Notion vers des projets Wroket, un répertoire Contacts ou des Bases de données, sans perdre le lien avec la source.",
    en: "Import Notion databases into Wroket projects, a Contacts directory, or Databases, while keeping the external link.",
  },
  "docs.notion.prereq1": { fr: "Palier Small teams ou supérieur (intégrations externes).", en: "Small teams plan or higher (external integrations)." },
  "docs.notion.prereq2": { fr: "Compte Notion avec droits de lecture sur les bases à importer.", en: "Notion account with read access to databases to import." },
  "docs.notion.prereq3": { fr: "Partager chaque base avec l'intégration Wroket dans Notion (voir dépannage).", en: "Share each database with the Wroket integration in Notion (see troubleshooting)." },
  "docs.notion.step1.title": { fr: "Connecter Notion", en: "Connect Notion" },
  "docs.notion.step1.p1": {
    fr: "Allez dans Paramètres › Intégrations et cliquez sur Connecter sur la carte Notion. Autorisez l'accès à l'espace de travail choisi.",
    en: "Go to Settings › Integrations and click Connect on the Notion card. Authorize access to the chosen workspace.",
  },
  "docs.notion.step2.title": { fr: "Choisir le type de contenu", en: "Choose content type" },
  "docs.notion.step2.p1": {
    fr: "Depuis Paramètres ou /migrate/notion, sélectionnez une base puis indiquez la destination : Projet (tâches + phases), Contacts (répertoire) ou Bases (tableau utilisateur).",
    en: "From Settings or /migrate/notion, pick a database and choose destination: Project (tasks + phases), Contacts (directory), or Databases (user table).",
  },
  "docs.notion.step2.p2": {
    fr: "Si le type est ambigu, Wroket vous laisse choisir manuellement plutôt que de deviner.",
    en: "If the type is ambiguous, Wroket lets you choose manually instead of guessing.",
  },
  "docs.notion.step3.title": { fr: "Préparer une base Projet (template)", en: "Prepare a Project database (template)" },
  "docs.notion.step3.p1": {
    fr: "Colonnes recommandées : Titre (title), Statut (select ou status), Échéance (date), Priorité (select), Assigné (person ou text), Description (rich text).",
    en: "Recommended columns: Title (title), Status (select or status), Due date (date), Priority (select), Assignee (person or text), Description (rich text).",
  },
  "docs.notion.step3.p2": {
    fr: "Les valeurs de statut deviennent des phases Wroket (ex. À faire, En cours, Terminé). Une page sans statut va dans la phase « Général ».",
    en: "Status values become Wroket phases (e.g. To do, In progress, Done). Pages without status go to the “General” phase.",
  },
  "docs.notion.step4.title": { fr: "Importer (API ou ZIP)", en: "Import (API or ZIP)" },
  "docs.notion.step4.p1": {
    fr: "API (recommandé) : prévisualisez le diff (créations, mises à jour, orphelins signalés), puis confirmez. Les re-sync ultérieures sont idempotentes.",
    en: "API (recommended): preview the diff (creates, updates, flagged orphans), then confirm. Later re-syncs are idempotent.",
  },
  "docs.notion.step4.p2": {
    fr: "ZIP : export Notion (Markdown & CSV), utile sans OAuth ou pour un import ponctuel de projet.",
    en: "ZIP: Notion export (Markdown & CSV), useful without OAuth or for a one-off project import.",
  },
  "docs.notion.trouble1.title": { fr: "Base introuvable ou vide", en: "Database missing or empty" },
  "docs.notion.trouble1.body": {
    fr: "Dans Notion : ouvrez la base › … › Connexions › ajoutez l'intégration Wroket. Reconnectez OAuth si vous avez changé d'espace.",
    en: "In Notion: open the database › … › Connections › add the Wroket integration. Reconnect OAuth if you changed workspace.",
  },
  "docs.notion.trouble2.title": { fr: "Une base People importée en tâches", en: "A People database imported as tasks" },
  "docs.notion.trouble2.body": {
    fr: "Relancez l'import en mode Contacts depuis /migrate/notion?mode=contacts. Les entrées CRM légères ne doivent pas devenir des tâches.",
    en: "Re-run import in Contacts mode from /migrate/notion?mode=contacts. Lightweight CRM entries should not become tasks.",
  },

  "docs.monday.metaTitle": { fr: "Guide Monday.com", en: "Monday.com guide" },
  "docs.monday.summary": {
    fr: "Connectez Monday, importez un board en projet, un tableau structuré en base, ou un doc en note.",
    en: "Connect Monday, import a board as a project, a structured board as a database, or a doc as a note.",
  },
  "docs.monday.prereq1": { fr: "Palier Small teams ou supérieur.", en: "Small teams plan or higher." },
  "docs.monday.prereq2": { fr: "Application Monday autorisée (scopes boards:read et docs:read).", en: "Monday app authorized (boards:read and docs:read scopes)." },
  "docs.monday.step1.title": { fr: "Connecter Monday", en: "Connect Monday" },
  "docs.monday.step1.p1": {
    fr: "Paramètres › Intégrations › Connecter sur Monday. Si les notes restent grisées, utilisez Reconnecter pour obtenir le scope docs:read.",
    en: "Settings › Integrations › Connect on Monday. If notes stay disabled, use Reconnect to grant docs:read scope.",
  },
  "docs.monday.step2.title": { fr: "Choisir la destination", en: "Choose destination" },
  "docs.monday.step2.p1": {
    fr: "Sur /migrate/monday : Board → Projet, tableau avec colonnes → Bases, document texte → Notes.",
    en: "On /migrate/monday: Board → Project, board with columns → Databases, text doc → Notes.",
  },
  "docs.monday.step3.title": { fr: "Prévisualiser et confirmer", en: "Preview and confirm" },
  "docs.monday.step3.p1": {
    fr: "Comme pour Notion, vérifiez le diff avant application. Les éléments absents du snapshot Monday sont signalés, jamais supprimés automatiquement.",
    en: "As with Notion, review the diff before applying. Items missing from the Monday snapshot are flagged, never auto-deleted.",
  },
  "docs.monday.trouble1.title": { fr: "Docs non listés", en: "Docs not listed" },
  "docs.monday.trouble1.body": {
    fr: "Reconnectez Monday avec docs:read. Vérifiez que le doc est dans un workspace accessible au compte connecté.",
    en: "Reconnect Monday with docs:read. Ensure the doc is in a workspace accessible to the connected account.",
  },

  "docs.calendar.metaTitle": { fr: "Guide Calendrier", en: "Calendar guide" },
  "docs.calendar.summary": {
    fr: "Synchronisez Google Calendar et Microsoft Outlook pour réserver des créneaux depuis l'Agenda Wroket.",
    en: "Sync Google Calendar and Microsoft Outlook to book slots from the Wroket Agenda.",
  },
  "docs.calendar.prereq1": { fr: "Palier Small teams pour la réservation sur calendrier externe et la sync complète.", en: "Small teams plan for external calendar booking and full sync." },
  "docs.calendar.prereq2": { fr: "Compte Google ou Microsoft autorisé à gérer au moins un agenda.", en: "Google or Microsoft account allowed to manage at least one calendar." },
  "docs.calendar.step1.title": { fr: "Connecter un compte", en: "Connect an account" },
  "docs.calendar.step1.p1": {
    fr: "Agenda › Gérer les calendriers (ou Paramètres). Connectez Google et/ou Microsoft — plusieurs comptes sont possibles.",
    en: "Agenda › Manage calendars (or Settings). Connect Google and/or Microsoft — multiple accounts are supported.",
  },
  "docs.calendar.step2.title": { fr: "Choisir les agendas visibles", en: "Choose visible calendars" },
  "docs.calendar.step2.p1": {
    fr: "Activez les agendas à afficher et personnalisez les couleurs. Les créneaux occupés servent à détecter les conflits.",
    en: "Enable calendars to display and customize colors. Busy slots are used for conflict detection.",
  },
  "docs.calendar.step3.title": { fr: "Compte prioritaire et visioconférence", en: "Preferred account and video" },
  "docs.calendar.step3.p1": {
    fr: "Si Google et Microsoft sont connectés, définissez le compte prioritaire pour les réservations. Meet (Google) ou Teams (Microsoft) peut être ajouté à l'événement.",
    en: "If both Google and Microsoft are connected, set the preferred account for bookings. Meet (Google) or Teams (Microsoft) can be added to the event.",
  },
  "docs.calendar.step4.title": { fr: "Réserver depuis l'Agenda", en: "Book from Agenda" },
  "docs.calendar.step4.p1": {
    fr: "Glissez une tâche sur un créneau. En cas de conflit, Wroket propose de forcer ou d'ajuster — comme pour les contraintes de projet.",
    en: "Drag a task onto a slot. On conflict, Wroket offers to force or adjust — same pattern as project constraints.",
  },
  "docs.calendar.trouble1.title": { fr: "Connexion refusée ou expirée", en: "Connection denied or expired" },
  "docs.calendar.trouble1.body": {
    fr: "Reconnectez le compte depuis Gérer les calendriers. Vérifiez que l'URL de redirection OAuth prod est bien configurée (api.wroket.com).",
    en: "Reconnect the account from Manage calendars. Ensure prod OAuth redirect URL is configured (api.wroket.com).",
  },

  "docs.slack.metaTitle": { fr: "Guide Slack", en: "Slack guide" },
  "docs.slack.summary": {
    fr: "Recevez des notifications Wroket dans un canal Slack via webhook entrant.",
    en: "Receive Wroket notifications in a Slack channel via incoming webhook.",
  },
  "docs.slack.prereq1": { fr: "Palier Small teams et droits pour créer un webhook dans votre workspace Slack.", en: "Small teams plan and permission to create a webhook in your Slack workspace." },
  "docs.slack.step1.title": { fr: "Créer le webhook Slack", en: "Create the Slack webhook" },
  "docs.slack.step1.p1": {
    fr: "Dans Slack : application ou workflow › Incoming Webhook › copiez l'URL HTTPS.",
    en: "In Slack: app or workflow › Incoming Webhook › copy the HTTPS URL.",
  },
  "docs.slack.step2.title": { fr: "Configurer dans Wroket", en: "Configure in Wroket" },
  "docs.slack.step2.p1": {
    fr: "Paramètres › Intégrations › Webhooks : collez l'URL, choisissez les événements (assignation, commentaire, digest…) et enregistrez.",
    en: "Settings › Integrations › Webhooks: paste the URL, pick events (assignment, comment, digest…), and save.",
  },

  "docs.teams.metaTitle": { fr: "Guide Microsoft Teams", en: "Microsoft Teams guide" },
  "docs.teams.summary": {
    fr: "Envoyez les notifications Wroket vers un canal Teams.",
    en: "Send Wroket notifications to a Teams channel.",
  },
  "docs.teams.prereq1": { fr: "Palier Small teams.", en: "Small teams plan." },
  "docs.teams.step1.title": { fr: "Webhook entrant Teams", en: "Teams incoming webhook" },
  "docs.teams.step1.p1": {
    fr: "Dans le canal Teams : Connecteurs › Incoming Webhook › créez et copiez l'URL.",
    en: "In the Teams channel: Connectors › Incoming Webhook › create and copy the URL.",
  },
  "docs.teams.step2.title": { fr: "Enregistrer dans Wroket", en: "Register in Wroket" },
  "docs.teams.step2.p1": {
    fr: "Paramètres › Intégrations › Webhooks Teams : URL + filtres d'événements, comme pour Slack.",
    en: "Settings › Integrations › Teams webhooks: URL + event filters, same as Slack.",
  },

  "docs.discord.metaTitle": { fr: "Guide Discord", en: "Discord guide" },
  "docs.discord.summary": {
    fr: "Webhook Discord pour les utilisateurs avancés (événements sélectionnés).",
    en: "Discord webhook for advanced users (selected events).",
  },
  "docs.discord.prereq1": { fr: "Palier Small teams.", en: "Small teams plan." },
  "docs.discord.step1.title": { fr: "Créer un webhook de salon", en: "Create a channel webhook" },
  "docs.discord.step1.p1": {
    fr: "Paramètres du salon Discord › Intégrations › Webhooks › Nouveau webhook. Copiez l'URL.",
    en: "Discord channel settings › Integrations › Webhooks › New webhook. Copy the URL.",
  },
  "docs.discord.step2.title": { fr: "Ajouter dans Wroket", en: "Add in Wroket" },
  "docs.discord.step2.p1": {
    fr: "Paramètres › Intégrations › section Discord (webhook avancé). Limite : pas de thread routing natif en V1.",
    en: "Settings › Integrations › Discord section (advanced webhook). Limit: no native thread routing in V1.",
  },

  "docs.pricing.faq5q": {
    fr: "Comment migrer depuis Notion ou Monday ?",
    en: "How do I migrate from Notion or Monday?",
  },
  "docs.pricing.faq5a": {
    fr: "Consultez les guides Notion et Monday dans la documentation. Un compte Small teams est requis pour l'import API.",
    en: "See the Notion and Monday guides in the documentation. A Small teams account is required for API import.",
  },
  "docs.pricing.faq5linkNotion": { fr: "Guide Notion", en: "Notion guide" },
  "docs.pricing.faq5linkMonday": { fr: "Guide Monday", en: "Monday guide" },
  "help.documentation": { fr: "Documentation", en: "Documentation" },
  "help.documentationDesc": { fr: "Guides d'intégration et migration", en: "Integration and migration guides" },
  "nav.documentation": { fr: "Documentation", en: "Documentation" },
  "settings.viewIntegrationGuide": { fr: "Voir le guide", en: "View guide" },
  "migrate.notion.docsLink": { fr: "Préparer votre base Notion", en: "Prepare your Notion database" },
  "migrate.monday.docsLink": { fr: "Guide d'import Monday", en: "Monday import guide" },
  "agenda.calendarDocsLink": { fr: "Guide calendrier Google & Outlook", en: "Google & Outlook calendar guide" },
} as const;
