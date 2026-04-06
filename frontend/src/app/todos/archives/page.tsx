import { redirect } from "next/navigation";

/** @deprecated Use Archive → Tâches (`/archive/tasks`). */
export default function ArchivesRedirectPage() {
  redirect("/archive/tasks");
}
