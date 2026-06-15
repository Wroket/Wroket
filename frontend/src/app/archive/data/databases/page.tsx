"use client";

import AppShell from "@/components/AppShell";
import ArchivedDatabasesPanel from "../../_components/ArchivedDatabasesPanel";

export default function ArchiveDataDatabasesPage() {
  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <ArchivedDatabasesPanel />
      </div>
    </AppShell>
  );
}
