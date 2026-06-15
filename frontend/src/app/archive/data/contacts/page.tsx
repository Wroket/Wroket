"use client";

import AppShell from "@/components/AppShell";
import ArchivedContactsPanel from "../../_components/ArchivedContactsPanel";

export default function ArchiveDataContactsPage() {
  return (
    <AppShell>
      <div className="max-w-[900px] mx-auto px-4 py-6">
        <ArchivedContactsPanel />
      </div>
    </AppShell>
  );
}
