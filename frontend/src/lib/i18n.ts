export type Locale = "fr" | "en";

const translations = {
  // ── App Shell / Header ──
  "app.name": { fr: "Wroket", en: "Wroket" },
  "app.logout": { fr: "Déconnexion", en: "Log out" },
  "nav.home": { fr: "Accueil", en: "Home" },
  "nav.tasks": { fr: "Mes tâches", en: "My tasks" },
  "nav.projects": { fr: "Mes projets", en: "My projects" },
  "nav.teams": { fr: "Mes équipes", en: "My teams" },
  "nav.settings": { fr: "Paramètres", en: "Settings" },
  "loading": { fr: "Chargement…", en: "Loading…" },

  // ── Login ──
  "login.title": { fr: "Connexion", en: "Sign in" },
  "login.register": { fr: "Inscription", en: "Sign up" },
  "login.email": { fr: "Email", en: "Email" },
  "login.password": { fr: "Mot de passe", en: "Password" },
  "login.submit": { fr: "Se connecter", en: "Sign in" },
  "login.submitting": { fr: "Connexion...", en: "Signing in..." },
  "login.createAccount": { fr: "Créer un compte", en: "Create account" },
  "login.creating": { fr: "Création...", en: "Creating..." },
  "login.accountCreated": { fr: "Compte créé. Vous pouvez vous connecter.", en: "Account created. You can now sign in." },
  "login.error": { fr: "Une erreur est survenue. Réessayez.", en: "An error occurred. Please try again." },

  // ── Dashboard ──
  "dashboard.title": { fr: "Tableau de bord", en: "Dashboard" },
  "dashboard.subtitle": { fr: "Vue d'ensemble de vos tâches", en: "Overview of your tasks" },
  "dashboard.activeTasks": { fr: "Tâches actives", en: "Active tasks" },
  "dashboard.completed": { fr: "Accomplies", en: "Completed" },
  "dashboard.completionRate": { fr: "Taux de complétion", en: "Completion rate" },
  "dashboard.overdue": { fr: "En retard", en: "Overdue" },
  "dashboard.noTask": { fr: "Aucune tâche", en: "No tasks" },
  "dashboard.taskCount": { fr: "tâche", en: "task" },
  "dashboard.tasksCount": { fr: "tâches", en: "tasks" },
  "dashboard.upcomingDeadlines": { fr: "Échéances proches", en: "Upcoming deadlines" },
  "dashboard.noUrgent": { fr: "Aucune échéance urgente", en: "No urgent deadlines" },
  "dashboard.recentCompleted": { fr: "Dernières tâches accomplies", en: "Recently completed" },
  "dashboard.noCompleted": { fr: "Aucune tâche accomplie", en: "No completed tasks" },
  "dashboard.viewAll": { fr: "Voir toutes les tâches →", en: "View all tasks →" },
  "dashboard.weeklySummary": { fr: "Bilan de la semaine", en: "Weekly summary" },
  "dashboard.weekCompleted": { fr: "Accomplies", en: "Completed" },
  "dashboard.onTime": { fr: "Dans les temps", en: "On time" },
  "dashboard.late": { fr: "En retard", en: "Late" },
  "dashboard.manageTasks": { fr: "Gérer mes tâches", en: "Manage my tasks" },

  // ── Todos page ──
  "todos.addPlaceholder": { fr: "Ajouter une tâche…", en: "Add a task…" },
  "todos.adding": { fr: "Ajout…", en: "Adding…" },
  "todos.add": { fr: "+ Ajouter", en: "+ Add" },
  "todos.titleLabel": { fr: "Intitulé", en: "Title" },
  "todos.importanceLabel": { fr: "Importance", en: "Importance" },
  "todos.effortLabel": { fr: "Effort", en: "Effort" },
  "todos.deadlineLabel": { fr: "Échéance", en: "Deadline" },
  "todos.listTitle": { fr: "Liste des tâches", en: "Task list" },
  "todos.matrixTitle": { fr: "Matrice d\u2019Eisenhower", en: "Eisenhower Matrix" },
  "todos.undo": { fr: "Annuler", en: "Undo" },
  "todos.undoTitle": { fr: "Annuler dernière action", en: "Undo last action" },
  "todos.priorities": { fr: "Priorités", en: "Priorities" },
  "todos.reactivate": { fr: "Réactiver", en: "Reactivate" },

  // ── Views toggle ──
  "view.list": { fr: "Liste", en: "List" },
  "view.cards": { fr: "Cards", en: "Cards" },
  "view.radar": { fr: "Radar", en: "Radar" },

  // ── Table headers ──
  "table.title": { fr: "Intitulé", en: "Title" },
  "table.classification": { fr: "Classification", en: "Classification" },
  "table.priority": { fr: "Priorité", en: "Priority" },
  "table.effort": { fr: "Effort", en: "Effort" },
  "table.deadline": { fr: "Échéance", en: "Deadline" },
  "table.actions": { fr: "Actions", en: "Actions" },

  // ── Quadrants ──
  "quadrant.doFirst": { fr: "FAIRE", en: "DO" },
  "quadrant.schedule": { fr: "PLANIFIER", en: "SCHEDULE" },
  "quadrant.delegate": { fr: "EXPÉDIER", en: "EXPEDITE" },
  "quadrant.eliminate": { fr: "DIFFÉRER", en: "DEFER" },

  // ── Filter buttons ──
  "filter.doFirst": { fr: "Faire", en: "Do" },
  "filter.schedule": { fr: "Planifier", en: "Schedule" },
  "filter.delegate": { fr: "Expédier", en: "Expedite" },
  "filter.eliminate": { fr: "Différer", en: "Defer" },
  "filter.completed": { fr: "Accomplies", en: "Completed" },
  "filter.cancelled": { fr: "Annulées", en: "Cancelled" },
  "filter.deleted": { fr: "Supprimées", en: "Deleted" },

  // ── Quadrant badges ──
  "badge.doFirst": { fr: "🔥 Faire", en: "🔥 Do" },
  "badge.schedule": { fr: "📅 Planifier", en: "📅 Schedule" },
  "badge.delegate": { fr: "⚡ Expédier", en: "⚡ Expedite" },
  "badge.eliminate": { fr: "⏸️ Différer", en: "⏸️ Defer" },

  // ── Priority badges ──
  "priority.high": { fr: "Haute", en: "High" },
  "priority.medium": { fr: "Moyenne", en: "Medium" },
  "priority.low": { fr: "Basse", en: "Low" },

  // ── Effort badges ──
  "effort.light": { fr: "Léger", en: "Light" },
  "effort.medium": { fr: "Moyen", en: "Medium" },
  "effort.heavy": { fr: "Lourd", en: "Heavy" },

  // ── Deadline labels ──
  "deadline.overdue": { fr: "En retard", en: "Overdue" },
  "deadline.today": { fr: "Aujourd'hui", en: "Today" },
  "deadline.tomorrow": { fr: "Demain", en: "Tomorrow" },
  "deadline.daysLeft": { fr: "j restants", en: "d left" },

  // ── Matrix labels ──
  "matrix.important": { fr: "Important", en: "Important" },
  "matrix.notImportant": { fr: "Pas important", en: "Not important" },
  "matrix.urgent": { fr: "Urgent", en: "Urgent" },
  "matrix.notUrgent": { fr: "Pas urgent", en: "Not urgent" },
  "matrix.empty": { fr: "Aucune tâche", en: "No tasks" },
  "matrix.showMore": { fr: "Voir plus", en: "Show more" },
  "matrix.showLess": { fr: "Voir moins", en: "Show less" },

  // ── Edit modal ──
  "edit.title": { fr: "Modifier la tâche", en: "Edit task" },
  "edit.titleField": { fr: "Intitulé", en: "Title" },
  "edit.priority": { fr: "Priorité", en: "Priority" },
  "edit.effort": { fr: "Effort", en: "Effort" },
  "edit.deadline": { fr: "Échéance", en: "Deadline" },
  "edit.cancel": { fr: "Annuler", en: "Cancel" },
  "edit.save": { fr: "Enregistrer", en: "Save" },
  "edit.saving": { fr: "Enregistrement…", en: "Saving…" },

  // ── Settings ──
  "settings.title": { fr: "Paramètres", en: "Settings" },
  "settings.subtitle": { fr: "Gérez votre compte et vos préférences", en: "Manage your account and preferences" },
  "settings.profile": { fr: "Mon profil", en: "My profile" },
  "settings.languages": { fr: "Langues", en: "Languages" },
  "settings.history": { fr: "Historique", en: "History" },
  "settings.admin": { fr: "Administration", en: "Administration" },
  "settings.firstName": { fr: "Prénom", en: "First name" },
  "settings.firstNamePlaceholder": { fr: "Votre prénom", en: "Your first name" },
  "settings.lastName": { fr: "Nom", en: "Last name" },
  "settings.lastNamePlaceholder": { fr: "Votre nom", en: "Your last name" },
  "settings.email": { fr: "Email", en: "Email" },
  "settings.password": { fr: "Mot de passe", en: "Password" },
  "settings.changePassword": { fr: "Modifier le mot de passe", en: "Change password" },
  "settings.save": { fr: "Enregistrer", en: "Save" },
  "settings.saving": { fr: "Enregistrement…", en: "Saving…" },
  "settings.saved": { fr: "Profil mis à jour", en: "Profile updated" },
  "settings.langLabel": { fr: "Langue de l'interface", en: "Interface language" },
  "settings.langHint": { fr: "La modification de la langue sera appliquée à l'ensemble de l'interface.", en: "Changing the language will apply to the entire interface." },
  "settings.historyTitle": { fr: "Historique", en: "History" },
  "settings.historyDesc": { fr: "Retrouvez l'historique de vos actions récentes.", en: "Find the history of your recent actions." },
  "settings.noActivity": { fr: "Aucune activité récente", en: "No recent activity" },
  "settings.adminTitle": { fr: "Administration", en: "Administration" },
  "settings.adminDesc": { fr: "Options réservées aux administrateurs de l'espace de travail.", en: "Options reserved for workspace administrators." },
  "settings.userManagement": { fr: "Gestion des utilisateurs", en: "User management" },
  "settings.userManagementDesc": { fr: "Inviter, supprimer ou modifier les rôles des membres.", en: "Invite, remove or change member roles." },
  "settings.dataExport": { fr: "Export des données", en: "Data export" },
  "settings.dataExportDesc": { fr: "Téléchargez un export complet de vos tâches et projets.", en: "Download a full export of your tasks and projects." },
  "settings.dangerZone": { fr: "Zone de danger", en: "Danger zone" },
  "settings.dangerDesc": { fr: "Ces actions sont irréversibles.", en: "These actions are irreversible." },
  "settings.deleteAccount": { fr: "Supprimer le compte", en: "Delete account" },

  // ── Placeholders ──
  "projects.title": { fr: "Mes projets", en: "My projects" },
  "projects.subtitle": { fr: "Organisez vos tâches par projet", en: "Organize your tasks by project" },
  "projects.comingSoon": { fr: "Cette fonctionnalité sera bientôt disponible.", en: "This feature will be available soon." },
  "teams.title": { fr: "Mes équipes", en: "My teams" },
  "teams.subtitle": { fr: "Collaborez avec vos collègues", en: "Collaborate with your colleagues" },
  "teams.comingSoon": { fr: "Cette fonctionnalité sera bientôt disponible.", en: "This feature will be available soon." },

  // ── Subtasks ──
  "subtask.title": { fr: "Sous-tâches", en: "Subtasks" },
  "subtask.add": { fr: "Ajouter une sous-tâche", en: "Add subtask" },
  "subtask.addShort": { fr: "Sous-tâche", en: "Subtask" },
  "subtask.placeholder": { fr: "Titre de la sous-tâche…", en: "Subtask title…" },
  "subtask.adding": { fr: "Ajout…", en: "Adding…" },
  "subtask.none": { fr: "Aucune sous-tâche", en: "No subtasks" },
  "subtask.deadlineError": { fr: "La deadline ne peut pas dépasser celle de la tâche parente", en: "Deadline cannot exceed parent task deadline" },
  "subtask.create": { fr: "Créer", en: "Create" },
  "subtask.cancel": { fr: "Annuler", en: "Cancel" },
  "subtask.done": { fr: "Terminé", en: "Done" },
} as const;

export type TranslationKey = keyof typeof translations;

let currentLocale: Locale = "fr";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof window !== "undefined") {
    localStorage.setItem("wroket-locale", locale);
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function initLocale(): Locale {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("wroket-locale");
    if (stored === "fr" || stored === "en") {
      currentLocale = stored;
    }
  }
  return currentLocale;
}

export function t(key: TranslationKey): string {
  const entry = translations[key];
  return entry[currentLocale] ?? entry.fr;
}
