import type { Project, ProjectPhase, Team, Todo, Priority, Effort, TodoStatus, AuthMeResponse } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

export type DetailTab = "board" | "kanban" | "gantt";
export type ProjectHealth = "done" | "overdue" | "at-risk" | "on-track" | "empty";

interface TemplateSubtask {
  title: { fr: string; en: string };
}

interface TemplateTask {
  title: { fr: string; en: string };
  subtasks: TemplateSubtask[];
}

export interface TemplatePhase {
  name: { fr: string; en: string };
  tasks: TemplateTask[];
}

export interface ProjectTemplate {
  id: string;
  label: { fr: string; en: string };
  description: { fr: string; en: string };
  phases: TemplatePhase[];
}

/** Legacy alias for code that still uses TEMPLATE_PHASES (name-only). */
export const TEMPLATE_PHASES: { name: { fr: string; en: string } }[] = [
  { name: { fr: "Cadrage", en: "Scoping" } },
  { name: { fr: "Conception", en: "Design" } },
  { name: { fr: "Développement", en: "Development" } },
  { name: { fr: "Tests & QA", en: "Testing & QA" } },
  { name: { fr: "Déploiement", en: "Deployment" } },
  { name: { fr: "Clôture", en: "Closure" } },
];

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "software",
    label: { fr: "Projet logiciel", en: "Software project" },
    description: { fr: "Phases classiques : cadrage, conception, dev, QA, déploiement, clôture — avec tâches et sous-tâches exemple.", en: "Classic phases: scoping, design, dev, QA, deployment, closure — with sample tasks and subtasks." },
    phases: [
      {
        name: { fr: "Cadrage", en: "Scoping" },
        tasks: [
          { title: { fr: "Définir le périmètre", en: "Define scope" }, subtasks: [{ title: { fr: "Recueillir les besoins", en: "Gather requirements" } }, { title: { fr: "Identifier les parties prenantes", en: "Identify stakeholders" } }] },
          { title: { fr: "Estimer les délais", en: "Estimate timelines" }, subtasks: [{ title: { fr: "Chiffrer les efforts", en: "Estimate efforts" } }, { title: { fr: "Créer le planning", en: "Create schedule" } }] },
          { title: { fr: "Valider le budget", en: "Validate budget" }, subtasks: [{ title: { fr: "Préparer le chiffrage", en: "Prepare cost estimate" } }, { title: { fr: "Obtenir les validations", en: "Get approvals" } }] },
        ],
      },
      {
        name: { fr: "Conception", en: "Design" },
        tasks: [
          { title: { fr: "Concevoir l'architecture", en: "Design architecture" }, subtasks: [{ title: { fr: "Choisir la stack technique", en: "Choose tech stack" } }, { title: { fr: "Documenter les décisions", en: "Document decisions" } }] },
          { title: { fr: "Créer les maquettes UI", en: "Create UI mockups" }, subtasks: [{ title: { fr: "Wireframes", en: "Wireframes" } }, { title: { fr: "Prototype haute fidélité", en: "High-fidelity prototype" } }] },
          { title: { fr: "Revue de conception", en: "Design review" }, subtasks: [{ title: { fr: "Recueillir les retours", en: "Collect feedback" } }, { title: { fr: "Intégrer les corrections", en: "Apply corrections" } }] },
        ],
      },
      {
        name: { fr: "Développement", en: "Development" },
        tasks: [
          { title: { fr: "Configurer l'environnement", en: "Set up environment" }, subtasks: [{ title: { fr: "Configurer le CI/CD", en: "Set up CI/CD" } }, { title: { fr: "Préparer la base de données", en: "Prepare database" } }] },
          { title: { fr: "Implémenter les fonctionnalités", en: "Implement features" }, subtasks: [{ title: { fr: "Backend / API", en: "Backend / API" } }, { title: { fr: "Frontend / UI", en: "Frontend / UI" } }] },
          { title: { fr: "Revue de code", en: "Code review" }, subtasks: [{ title: { fr: "Pull requests", en: "Pull requests" } }, { title: { fr: "Correction des remarques", en: "Fix review comments" } }] },
        ],
      },
      {
        name: { fr: "Tests & QA", en: "Testing & QA" },
        tasks: [
          { title: { fr: "Rédiger les cas de test", en: "Write test cases" }, subtasks: [{ title: { fr: "Tests fonctionnels", en: "Functional tests" } }, { title: { fr: "Tests de régression", en: "Regression tests" } }] },
          { title: { fr: "Exécuter les tests", en: "Run tests" }, subtasks: [{ title: { fr: "Tests manuels", en: "Manual tests" } }, { title: { fr: "Tests automatisés", en: "Automated tests" } }] },
          { title: { fr: "Corriger les bugs", en: "Fix bugs" }, subtasks: [{ title: { fr: "Bugs critiques", en: "Critical bugs" } }, { title: { fr: "Bugs mineurs", en: "Minor bugs" } }] },
        ],
      },
      {
        name: { fr: "Déploiement", en: "Deployment" },
        tasks: [
          { title: { fr: "Préparer la mise en production", en: "Prepare production release" }, subtasks: [{ title: { fr: "Checklist de déploiement", en: "Deployment checklist" } }, { title: { fr: "Plan de rollback", en: "Rollback plan" } }] },
          { title: { fr: "Déployer en production", en: "Deploy to production" }, subtasks: [{ title: { fr: "Migration des données", en: "Data migration" } }, { title: { fr: "Vérification post-déploiement", en: "Post-deployment check" } }] },
          { title: { fr: "Communiquer la release", en: "Communicate release" }, subtasks: [{ title: { fr: "Notes de version", en: "Release notes" } }, { title: { fr: "Notifier les utilisateurs", en: "Notify users" } }] },
        ],
      },
      {
        name: { fr: "Clôture", en: "Closure" },
        tasks: [
          { title: { fr: "Bilan du projet", en: "Project retrospective" }, subtasks: [{ title: { fr: "Leçons apprises", en: "Lessons learned" } }, { title: { fr: "Rapport de fin de projet", en: "Project closure report" } }] },
          { title: { fr: "Archiver les livrables", en: "Archive deliverables" }, subtasks: [{ title: { fr: "Documentation finale", en: "Final documentation" } }, { title: { fr: "Sauvegarde des assets", en: "Backup assets" } }] },
          { title: { fr: "Clôturer les accès", en: "Close access" }, subtasks: [{ title: { fr: "Révoquer les droits temporaires", en: "Revoke temporary rights" } }, { title: { fr: "Archiver les environnements", en: "Archive environments" } }] },
        ],
      },
    ],
  },
  {
    id: "product-launch",
    label: { fr: "Lancement produit", en: "Product launch" },
    description: { fr: "De la stratégie au go-live : recherche, positionnement, marketing, lancement et suivi.", en: "From strategy to go-live: research, positioning, marketing, launch and monitoring." },
    phases: [
      {
        name: { fr: "Recherche & Stratégie", en: "Research & Strategy" },
        tasks: [
          { title: { fr: "Analyser le marché", en: "Analyse market" }, subtasks: [{ title: { fr: "Étude concurrentielle", en: "Competitive analysis" } }, { title: { fr: "Segmentation cible", en: "Target segmentation" } }] },
          { title: { fr: "Définir la proposition de valeur", en: "Define value proposition" }, subtasks: [{ title: { fr: "Identifier les bénéfices clés", en: "Identify key benefits" } }, { title: { fr: "Formaliser le positionnement", en: "Formalise positioning" } }] },
          { title: { fr: "Définir les KPIs", en: "Define KPIs" }, subtasks: [{ title: { fr: "Métriques de lancement", en: "Launch metrics" } }, { title: { fr: "Objectifs de croissance", en: "Growth targets" } }] },
        ],
      },
      {
        name: { fr: "Préparation Marketing", en: "Marketing Prep" },
        tasks: [
          { title: { fr: "Créer les assets marketing", en: "Create marketing assets" }, subtasks: [{ title: { fr: "Visuels et branding", en: "Visuals and branding" } }, { title: { fr: "Copys et messages", en: "Copies and messages" } }] },
          { title: { fr: "Préparer le site web", en: "Prepare website" }, subtasks: [{ title: { fr: "Landing page", en: "Landing page" } }, { title: { fr: "SEO de base", en: "Basic SEO" } }] },
          { title: { fr: "Planifier les campagnes", en: "Plan campaigns" }, subtasks: [{ title: { fr: "Email marketing", en: "Email marketing" } }, { title: { fr: "Réseaux sociaux", en: "Social media" } }] },
        ],
      },
      {
        name: { fr: "Lancement", en: "Launch" },
        tasks: [
          { title: { fr: "Exécuter le go-to-market", en: "Execute go-to-market" }, subtasks: [{ title: { fr: "Activation des canaux", en: "Channel activation" } }, { title: { fr: "Relations presse", en: "PR outreach" } }] },
          { title: { fr: "Activer la communauté", en: "Activate community" }, subtasks: [{ title: { fr: "Bêta utilisateurs", en: "Beta users" } }, { title: { fr: "Ambassadeurs", en: "Ambassadors" } }] },
          { title: { fr: "Support au lancement", en: "Launch support" }, subtasks: [{ title: { fr: "FAQ et help center", en: "FAQ and help center" } }, { title: { fr: "Équipe support dédiée", en: "Dedicated support team" } }] },
        ],
      },
      {
        name: { fr: "Suivi & Optimisation", en: "Monitoring & Optimisation" },
        tasks: [
          { title: { fr: "Analyser les métriques", en: "Analyse metrics" }, subtasks: [{ title: { fr: "Tableaux de bord analytics", en: "Analytics dashboards" } }, { title: { fr: "Rapport hebdomadaire", en: "Weekly report" } }] },
          { title: { fr: "Collecter les retours utilisateurs", en: "Collect user feedback" }, subtasks: [{ title: { fr: "Interviews utilisateurs", en: "User interviews" } }, { title: { fr: "Enquêtes NPS", en: "NPS surveys" } }] },
          { title: { fr: "Itérer sur le produit", en: "Iterate on product" }, subtasks: [{ title: { fr: "Prioriser les retours", en: "Prioritise feedback" } }, { title: { fr: "Planifier les correctifs", en: "Plan fixes" } }] },
        ],
      },
    ],
  },
  {
    id: "website-redesign",
    label: { fr: "Refonte de site web", en: "Website redesign" },
    description: { fr: "Audit, conception, développement et mise en ligne d'un nouveau site.", en: "Audit, design, development and go-live for a new website." },
    phases: [
      {
        name: { fr: "Audit & Analyse", en: "Audit & Analysis" },
        tasks: [
          { title: { fr: "Audit du site existant", en: "Audit existing site" }, subtasks: [{ title: { fr: "Analyse du trafic", en: "Traffic analysis" } }, { title: { fr: "Inventaire du contenu", en: "Content inventory" } }] },
          { title: { fr: "Analyse UX", en: "UX analysis" }, subtasks: [{ title: { fr: "Heatmaps et sessions", en: "Heatmaps and sessions" } }, { title: { fr: "Tests utilisateurs existants", en: "Existing user tests" } }] },
          { title: { fr: "Benchmarking concurrents", en: "Competitor benchmarking" }, subtasks: [{ title: { fr: "Identifier les best practices", en: "Identify best practices" } }, { title: { fr: "Rapport benchmark", en: "Benchmark report" } }] },
        ],
      },
      {
        name: { fr: "Conception", en: "Design" },
        tasks: [
          { title: { fr: "Architecture de l'information", en: "Information architecture" }, subtasks: [{ title: { fr: "Sitemap", en: "Sitemap" } }, { title: { fr: "Arborescence de navigation", en: "Navigation tree" } }] },
          { title: { fr: "Créer le design system", en: "Create design system" }, subtasks: [{ title: { fr: "Typographie et couleurs", en: "Typography and colors" } }, { title: { fr: "Composants UI", en: "UI components" } }] },
          { title: { fr: "Prototyper les pages clés", en: "Prototype key pages" }, subtasks: [{ title: { fr: "Page d'accueil", en: "Home page" } }, { title: { fr: "Pages produits / services", en: "Product / service pages" } }] },
        ],
      },
      {
        name: { fr: "Développement", en: "Development" },
        tasks: [
          { title: { fr: "Intégrer les templates", en: "Integrate templates" }, subtasks: [{ title: { fr: "Structure HTML/CSS", en: "HTML/CSS structure" } }, { title: { fr: "Responsive design", en: "Responsive design" } }] },
          { title: { fr: "Migrer le contenu", en: "Migrate content" }, subtasks: [{ title: { fr: "Importer les pages", en: "Import pages" } }, { title: { fr: "Optimiser les images", en: "Optimise images" } }] },
          { title: { fr: "Connecter les intégrations", en: "Connect integrations" }, subtasks: [{ title: { fr: "Analytics", en: "Analytics" } }, { title: { fr: "CRM / Marketing automation", en: "CRM / Marketing automation" } }] },
        ],
      },
      {
        name: { fr: "Tests & Mise en ligne", en: "Testing & Go-live" },
        tasks: [
          { title: { fr: "Tests cross-navigateurs", en: "Cross-browser testing" }, subtasks: [{ title: { fr: "Desktop", en: "Desktop" } }, { title: { fr: "Mobile / Tablette", en: "Mobile / Tablet" } }] },
          { title: { fr: "Optimiser les performances", en: "Optimise performance" }, subtasks: [{ title: { fr: "Core Web Vitals", en: "Core Web Vitals" } }, { title: { fr: "Cache et CDN", en: "Cache and CDN" } }] },
          { title: { fr: "Mise en production", en: "Go live" }, subtasks: [{ title: { fr: "DNS et certificat SSL", en: "DNS and SSL certificate" } }, { title: { fr: "Surveillance post-lancement", en: "Post-launch monitoring" } }] },
        ],
      },
    ],
  },
  {
    id: "client-onboarding",
    label: { fr: "Onboarding client", en: "Client onboarding" },
    description: { fr: "Accueil, intégration et fidélisation d'un nouveau client.", en: "Welcome, integration and retention of a new client." },
    phases: [
      {
        name: { fr: "Accueil", en: "Welcome" },
        tasks: [
          { title: { fr: "Envoyer le kit de bienvenue", en: "Send welcome kit" }, subtasks: [{ title: { fr: "Email de bienvenue", en: "Welcome email" } }, { title: { fr: "Accès aux outils", en: "Tool access" } }] },
          { title: { fr: "Planifier le kick-off", en: "Schedule kick-off" }, subtasks: [{ title: { fr: "Agenda de la réunion", en: "Meeting agenda" } }, { title: { fr: "Invitations envoyées", en: "Invitations sent" } }] },
          { title: { fr: "Présenter l'équipe dédiée", en: "Introduce dedicated team" }, subtasks: [{ title: { fr: "Fiche contact", en: "Contact card" } }, { title: { fr: "Canaux de communication", en: "Communication channels" } }] },
        ],
      },
      {
        name: { fr: "Configuration", en: "Configuration" },
        tasks: [
          { title: { fr: "Configurer l'environnement client", en: "Configure client environment" }, subtasks: [{ title: { fr: "Créer les comptes", en: "Create accounts" } }, { title: { fr: "Paramétrer les droits", en: "Set permissions" } }] },
          { title: { fr: "Importer les données", en: "Import data" }, subtasks: [{ title: { fr: "Préparer le modèle d'import", en: "Prepare import template" } }, { title: { fr: "Valider les données", en: "Validate data" } }] },
          { title: { fr: "Configurer les intégrations", en: "Set up integrations" }, subtasks: [{ title: { fr: "Connexion CRM", en: "CRM connection" } }, { title: { fr: "Connexion facturation", en: "Billing connection" } }] },
        ],
      },
      {
        name: { fr: "Formation", en: "Training" },
        tasks: [
          { title: { fr: "Animer les sessions de formation", en: "Deliver training sessions" }, subtasks: [{ title: { fr: "Formation administrateurs", en: "Admin training" } }, { title: { fr: "Formation utilisateurs finaux", en: "End-user training" } }] },
          { title: { fr: "Livrer la documentation", en: "Deliver documentation" }, subtasks: [{ title: { fr: "Guide utilisateur", en: "User guide" } }, { title: { fr: "FAQ", en: "FAQ" } }] },
          { title: { fr: "Valider les acquis", en: "Validate knowledge" }, subtasks: [{ title: { fr: "Quiz de validation", en: "Validation quiz" } }, { title: { fr: "Certification interne", en: "Internal certification" } }] },
        ],
      },
      {
        name: { fr: "Suivi post-onboarding", en: "Post-onboarding follow-up" },
        tasks: [
          { title: { fr: "Premier bilan à 30 jours", en: "30-day review" }, subtasks: [{ title: { fr: "Rapport d'usage", en: "Usage report" } }, { title: { fr: "Points d'amélioration", en: "Improvement points" } }] },
          { title: { fr: "Recueillir la satisfaction", en: "Collect satisfaction" }, subtasks: [{ title: { fr: "Enquête CSAT", en: "CSAT survey" } }, { title: { fr: "Appel de suivi", en: "Follow-up call" } }] },
          { title: { fr: "Planifier la montée en puissance", en: "Plan scale-up" }, subtasks: [{ title: { fr: "Identifier les opportunités", en: "Identify opportunities" } }, { title: { fr: "Proposer des modules avancés", en: "Propose advanced modules" } }] },
        ],
      },
    ],
  },
  {
    id: "recruitment",
    label: { fr: "Recrutement", en: "Recruitment" },
    description: { fr: "Processus de recrutement de la définition du poste à l'intégration du candidat.", en: "Recruitment process from job definition to candidate integration." },
    phases: [
      {
        name: { fr: "Définition du poste", en: "Job definition" },
        tasks: [
          { title: { fr: "Rédiger la fiche de poste", en: "Write job description" }, subtasks: [{ title: { fr: "Compétences requises", en: "Required skills" } }, { title: { fr: "Conditions et avantages", en: "Conditions and benefits" } }] },
          { title: { fr: "Valider le budget", en: "Validate budget" }, subtasks: [{ title: { fr: "Grille salariale", en: "Salary grid" } }, { title: { fr: "Validation RH", en: "HR approval" } }] },
          { title: { fr: "Choisir les canaux de diffusion", en: "Choose sourcing channels" }, subtasks: [{ title: { fr: "Job boards", en: "Job boards" } }, { title: { fr: "Réseau et cooptation", en: "Network and referral" } }] },
        ],
      },
      {
        name: { fr: "Sourcing & Présélection", en: "Sourcing & Screening" },
        tasks: [
          { title: { fr: "Diffuser l'offre", en: "Post the job" }, subtasks: [{ title: { fr: "Publications externes", en: "External postings" } }, { title: { fr: "Communication interne", en: "Internal communication" } }] },
          { title: { fr: "Trier les candidatures", en: "Screen applications" }, subtasks: [{ title: { fr: "Évaluer les CV", en: "Evaluate CVs" } }, { title: { fr: "Qualifier par téléphone", en: "Phone screening" } }] },
          { title: { fr: "Constituer la short-list", en: "Build short-list" }, subtasks: [{ title: { fr: "Critères de sélection", en: "Selection criteria" } }, { title: { fr: "Validation par le manager", en: "Manager validation" } }] },
        ],
      },
      {
        name: { fr: "Entretiens", en: "Interviews" },
        tasks: [
          { title: { fr: "Organiser les entretiens", en: "Organise interviews" }, subtasks: [{ title: { fr: "Planification agenda", en: "Schedule planning" } }, { title: { fr: "Briefer les interviewers", en: "Brief interviewers" } }] },
          { title: { fr: "Conduire les entretiens", en: "Conduct interviews" }, subtasks: [{ title: { fr: "Entretien RH", en: "HR interview" } }, { title: { fr: "Entretien technique / métier", en: "Technical / functional interview" } }] },
          { title: { fr: "Évaluer les candidats", en: "Evaluate candidates" }, subtasks: [{ title: { fr: "Grilles d'évaluation", en: "Evaluation grids" } }, { title: { fr: "Décision collective", en: "Collective decision" } }] },
        ],
      },
      {
        name: { fr: "Intégration", en: "Onboarding" },
        tasks: [
          { title: { fr: "Préparer l'arrivée", en: "Prepare arrival" }, subtasks: [{ title: { fr: "Poste de travail et accès", en: "Workstation and access" } }, { title: { fr: "Livret d'accueil", en: "Welcome booklet" } }] },
          { title: { fr: "Accueillir le nouveau collaborateur", en: "Welcome new hire" }, subtasks: [{ title: { fr: "Présentation de l'équipe", en: "Team introduction" } }, { title: { fr: "Visite des locaux", en: "Office tour" } }] },
          { title: { fr: "Suivre la période d'essai", en: "Monitor probation" }, subtasks: [{ title: { fr: "Points réguliers", en: "Regular check-ins" } }, { title: { fr: "Bilan de fin d'essai", en: "End of probation review" } }] },
        ],
      },
    ],
  },
  {
    id: "agile-sprint",
    label: { fr: "Sprint Agile (2 semaines)", en: "Agile Sprint (2 weeks)" },
    description: { fr: "Cadre Scrum léger : planification, exécution, revue et rétrospective.", en: "Lightweight Scrum: planning, execution, review and retrospective." },
    phases: [
      {
        name: { fr: "Planification du Sprint", en: "Sprint Planning" },
        tasks: [
          { title: { fr: "Affiner le backlog", en: "Refine backlog" }, subtasks: [{ title: { fr: "Reprioriser les user stories", en: "Reprioritise user stories" } }, { title: { fr: "Estimer les points", en: "Estimate story points" } }] },
          { title: { fr: "Définir l'objectif du sprint", en: "Define sprint goal" }, subtasks: [{ title: { fr: "Choisir les stories à traiter", en: "Select stories to tackle" } }, { title: { fr: "Valider la capacité équipe", en: "Validate team capacity" } }] },
          { title: { fr: "Créer le sprint backlog", en: "Create sprint backlog" }, subtasks: [{ title: { fr: "Décomposer en tâches techniques", en: "Break into technical tasks" } }, { title: { fr: "Assigner les tâches", en: "Assign tasks" } }] },
        ],
      },
      {
        name: { fr: "Exécution", en: "Execution" },
        tasks: [
          { title: { fr: "Daily stand-ups", en: "Daily stand-ups" }, subtasks: [{ title: { fr: "Avancement", en: "Progress" } }, { title: { fr: "Blocages", en: "Blockers" } }] },
          { title: { fr: "Développer les features", en: "Develop features" }, subtasks: [{ title: { fr: "Développement", en: "Development" } }, { title: { fr: "Tests unitaires", en: "Unit tests" } }] },
          { title: { fr: "Code review et merge", en: "Code review and merge" }, subtasks: [{ title: { fr: "Pull requests", en: "Pull requests" } }, { title: { fr: "Déploiement sur staging", en: "Deploy to staging" } }] },
        ],
      },
      {
        name: { fr: "Sprint Review", en: "Sprint Review" },
        tasks: [
          { title: { fr: "Préparer la démo", en: "Prepare demo" }, subtasks: [{ title: { fr: "Scénarios de démo", en: "Demo scenarios" } }, { title: { fr: "Environnement de démo", en: "Demo environment" } }] },
          { title: { fr: "Présenter les livrables", en: "Present deliverables" }, subtasks: [{ title: { fr: "Démonstration live", en: "Live demonstration" } }, { title: { fr: "Recueillir les retours", en: "Collect feedback" } }] },
          { title: { fr: "Mettre à jour le backlog", en: "Update backlog" }, subtasks: [{ title: { fr: "Nouvelles user stories", en: "New user stories" } }, { title: { fr: "Ajustement des priorités", en: "Priority adjustment" } }] },
        ],
      },
      {
        name: { fr: "Rétrospective", en: "Retrospective" },
        tasks: [
          { title: { fr: "Identifier ce qui a bien marché", en: "Identify what went well" }, subtasks: [{ title: { fr: "Points positifs équipe", en: "Team positives" } }, { title: { fr: "Succès techniques", en: "Technical successes" } }] },
          { title: { fr: "Identifier les points à améliorer", en: "Identify improvement areas" }, subtasks: [{ title: { fr: "Obstacles rencontrés", en: "Obstacles encountered" } }, { title: { fr: "Processus inefficaces", en: "Inefficient processes" } }] },
          { title: { fr: "Définir les actions correctives", en: "Define action items" }, subtasks: [{ title: { fr: "Actions prioritaires", en: "Priority actions" } }, { title: { fr: "Responsable et deadline", en: "Owner and deadline" } }] },
        ],
      },
    ],
  },
];

export function formatMins(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h > 0 ? `${h}h` : ""}${r > 0 ? `${r}m` : h === 0 ? "0m" : ""}`;
}

export function getHealthConfig(t: (key: TranslationKey) => string): Record<ProjectHealth, { label: string; color: string; bg: string; ring: string }> {
  return {
    done: { label: t("projects.healthDone"), color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", ring: "bg-emerald-500" },
    overdue: { label: t("projects.healthOverdue"), color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", ring: "bg-red-500" },
    "at-risk": { label: t("projects.healthAtRisk"), color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", ring: "bg-amber-500" },
    "on-track": { label: t("projects.healthOnTrack"), color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", ring: "bg-blue-500" },
    empty: { label: "", color: "", bg: "", ring: "" },
  };
}

export type { Project, ProjectPhase, Team, Todo, Priority, Effort, TodoStatus, AuthMeResponse, TranslationKey };
