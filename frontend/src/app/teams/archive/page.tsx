import { redirect } from "next/navigation";

/** @deprecated Use /archive (tasks, projects, teams). */
export default function TeamsArchiveLegacyRedirect() {
  redirect("/archive/tasks");
}
