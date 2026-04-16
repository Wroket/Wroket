"use client";

import AppShell from "@/components/AppShell";
import ArchivedNotesPanel from "../_components/ArchivedNotesPanel";

export default function ArchiveNotesPage() {
  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <ArchivedNotesPanel />
      </div>
    </AppShell>
  );
}
