import { API_BASE_URL, apiFetchDefaults } from "./core";
import type { Priority, Effort } from "./todos";

export interface TaskTemplate {
  id: string;
  userId: string;
  name: string;
  emoji: string;
  description: string;
  priority: Priority;
  effort: Effort;
  estimatedMinutes: number | null;
  tags: string[];
  subtasks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  emoji?: string;
  description?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  tags?: string[];
  subtasks?: string[];
}

export interface UpdateTemplateInput {
  name?: string;
  emoji?: string;
  description?: string;
  priority?: Priority;
  effort?: Effort;
  estimatedMinutes?: number | null;
  tags?: string[];
  subtasks?: string[];
}

export async function getTemplates(): Promise<TaskTemplate[]> {
  const res = await fetch(`${API_BASE_URL}/templates`, { ...apiFetchDefaults });
  if (!res.ok) throw new Error("Impossible de charger les templates");
  return res.json() as Promise<TaskTemplate[]>;
}

export async function createTemplate(input: CreateTemplateInput): Promise<TaskTemplate> {
  const res = await fetch(`${API_BASE_URL}/templates`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = "Impossible de créer le template";
    try { const j = await res.json() as { message?: string }; if (j.message) msg = j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<TaskTemplate>;
}

export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<TaskTemplate> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(id)}`, {
    ...apiFetchDefaults,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = "Impossible de modifier le template";
    try { const j = await res.json() as { message?: string }; if (j.message) msg = j.message; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<TaskTemplate>;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(id)}`, {
    ...apiFetchDefaults,
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Impossible de supprimer le template");
}

/** Built-in system templates (client-side, no backend needed). */
export const SYSTEM_TEMPLATES: Omit<TaskTemplate, "id" | "userId" | "createdAt" | "updatedAt">[] = [
  {
    name: "Lancement de projet",
    emoji: "🚀",
    description: "Démarrage d'un nouveau projet avec les étapes clés.",
    priority: "high",
    effort: "heavy",
    estimatedMinutes: 120,
    tags: ["projet"],
    subtasks: ["Définir les objectifs", "Identifier les parties prenantes", "Planifier les jalons", "Kick-off équipe"],
  },
  {
    name: "Correction de bug",
    emoji: "🐛",
    description: "Traitement d'un bug : reproduction, diagnostic, correction, test.",
    priority: "high",
    effort: "medium",
    estimatedMinutes: 60,
    tags: ["bug", "dev"],
    subtasks: ["Reproduire le bug", "Diagnostiquer la cause", "Implémenter la correction", "Tester & valider"],
  },
  {
    name: "Revue hebdomadaire",
    emoji: "📅",
    description: "Bilan de la semaine écoulée et préparation de la suivante.",
    priority: "medium",
    effort: "light",
    estimatedMinutes: 30,
    tags: ["récurrent", "revue"],
    subtasks: ["Bilan de la semaine", "Tâches non finies à reporter", "Priorités semaine suivante"],
  },
  {
    name: "Suivi client",
    emoji: "📧",
    description: "Relance ou suivi d'un dossier client en cours.",
    priority: "medium",
    effort: "light",
    estimatedMinutes: 20,
    tags: ["client", "communication"],
    subtasks: [],
  },
  {
    name: "Déploiement",
    emoji: "⚙️",
    description: "Mise en production d'une version avec checklist de validation.",
    priority: "high",
    effort: "medium",
    estimatedMinutes: 45,
    tags: ["devops", "prod"],
    subtasks: ["Tests de non-régression", "Validation go/no-go", "Déploiement", "Vérification post-déploiement"],
  },
];
