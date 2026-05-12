import { listChildProjects, updateProject } from "./projectService";
import { archiveTodosByProjectId } from "./todoService";

/**
 * After a root project is set to archived, archive each active direct sub-project
 * and move its active tasks to completed (same semantics as {@link archiveTodosByProjectId}).
 */
export async function cascadeArchiveActiveSubprojects(
  uid: string,
  email: string,
  parentProjectId: string,
): Promise<void> {
  for (const child of listChildProjects(parentProjectId)) {
    if (child.status !== "active") continue;
    updateProject(uid, email, child.id, { status: "archived" });
    await archiveTodosByProjectId(child.id);
  }
}

/**
 * When restoring an archived parent to active, reactivate direct sub-projects that are still archived.
 * Does not change todo statuses (tasks stay completed).
 */
export function cascadeRestoreArchivedSubprojects(uid: string, email: string, parentProjectId: string): void {
  for (const child of listChildProjects(parentProjectId)) {
    if (child.status !== "archived") continue;
    updateProject(uid, email, child.id, { status: "active" });
  }
}
