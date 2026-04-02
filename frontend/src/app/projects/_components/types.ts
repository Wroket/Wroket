import type { Project, ProjectPhase, Team, Todo, Priority, Effort, TodoStatus, AuthMeResponse } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

export type DetailTab = "board" | "kanban" | "gantt";
export type ProjectHealth = "done" | "overdue" | "at-risk" | "on-track" | "empty";

export const TEMPLATE_PHASES: { name: { fr: string; en: string } }[] = [
  { name: { fr: "Cadrage", en: "Scoping" } },
  { name: { fr: "Conception", en: "Design" } },
  { name: { fr: "Développement", en: "Development" } },
  { name: { fr: "Tests & QA", en: "Testing & QA" } },
  { name: { fr: "Déploiement", en: "Deployment" } },
  { name: { fr: "Clôture", en: "Closure" } },
];

export function formatMins(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h > 0 ? `${h}h` : ""}${r > 0 ? `${r}m` : h === 0 ? "0m" : ""}`;
}

export function getHealthConfig(t: (key: TranslationKey) => string): Record<ProjectHealth, { label: string; color: string; bg: string; ring: string }> {
  return {
    done: { label: t("projects.healthDone" as TranslationKey), color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", ring: "bg-emerald-500" },
    overdue: { label: t("projects.healthOverdue" as TranslationKey), color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/30", ring: "bg-red-500" },
    "at-risk": { label: t("projects.healthAtRisk" as TranslationKey), color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/30", ring: "bg-amber-500" },
    "on-track": { label: t("projects.healthOnTrack" as TranslationKey), color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30", ring: "bg-blue-500" },
    empty: { label: "", color: "", bg: "", ring: "" },
  };
}

export type { Project, ProjectPhase, Team, Todo, Priority, Effort, TodoStatus, AuthMeResponse, TranslationKey };
