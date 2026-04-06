"use client";

import AppShell from "@/components/AppShell";
import ArchivedTasksPanel from "../_components/ArchivedTasksPanel";

export default function ArchiveTasksPage() {
  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto">
        <ArchivedTasksPanel />
      </div>
    </AppShell>
  );
}
