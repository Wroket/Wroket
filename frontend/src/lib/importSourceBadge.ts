import type { Project } from "@/lib/api/projects";
import type { ExternalRef } from "@/lib/api/todos";
import type { TranslationKey } from "@/lib/i18n";

export type ImportSourceBadge = {
  key: "notion" | "monday";
  labelKey: TranslationKey;
  className: string;
};

/** Returns a display badge for projects mirrored from Notion or Monday. */
export function getImportSourceBadge(project: { externalRef?: ExternalRef | null }): ImportSourceBadge | null {
  const provider = project.externalRef?.provider;
  if (provider === "notion") {
    return {
      key: "notion",
      labelKey: "projects.importTagNotion",
      className: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",
    };
  }
  if (provider === "monday") {
    return {
      key: "monday",
      labelKey: "projects.importTagMonday",
      className: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    };
  }
  return null;
}

/** True when a Wroket project is linked to a Notion database via API sync. */
export function isNotionProjectLinkedToDatabase(project: Project, databaseId: string): boolean {
  const ref = project.externalRef;
  if (!ref || ref.provider !== "notion") return false;
  return ref.externalId === databaseId || ref.externalParentId === databaseId;
}

/** Active projects imported from Notion (API or ZIP). */
export function filterNotionImportedProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.status === "active" && p.externalRef?.provider === "notion");
}
