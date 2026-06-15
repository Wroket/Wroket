/**
 * Synchronise dossiers Notes et cycle de vie projet (archive / suppression).
 */

import {
  archiveNoteFoldersByProjectId,
  purgeNoteFoldersByProjectId,
  restoreNoteFoldersByProjectId,
} from "./noteFolderService";
import { clearProjectNotesOrganizationGlobally } from "./noteService";

/** Archive les dossiers liés à un projet (statut → archived). */
export function cascadeProjectNoteFoldersOnArchive(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  archiveNoteFoldersByProjectId(pid);
}

/** Restaure les dossiers liés à un projet réactivé. */
export function cascadeProjectNoteFoldersOnRestore(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  restoreNoteFoldersByProjectId(pid);
}

/** Supprime le dossier Notes du projet et détache les notes restantes. */
export function cascadeProjectNoteFoldersOnDelete(projectId: string): void {
  const pid = projectId.trim();
  if (!pid) return;
  purgeNoteFoldersByProjectId(pid);
  clearProjectNotesOrganizationGlobally(pid);
}
