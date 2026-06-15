import { redirect } from "next/navigation";

/** @deprecated Use Archive → Données → Documents (`/archive/data/documents`). */
export default function ArchiveNotesRedirectPage() {
  redirect("/archive/data/documents");
}
