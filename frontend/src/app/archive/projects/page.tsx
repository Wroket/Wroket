"use client";

import AppShell from "@/components/AppShell";
import ArchivedProjectsPanel from "../_components/ArchivedProjectsPanel";

export default function ArchiveProjectsPage() {
  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto">
        <ArchivedProjectsPanel />
      </div>
    </AppShell>
  );
}
