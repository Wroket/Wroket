"use client";

import AppShell from "@/components/AppShell";
import ArchivedDataHub from "../_components/ArchivedDataHub";

export default function ArchiveDataPage() {
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <ArchivedDataHub />
      </div>
    </AppShell>
  );
}
