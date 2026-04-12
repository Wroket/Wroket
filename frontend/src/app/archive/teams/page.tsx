"use client";

import { useCallback } from "react";

import AppShell from "@/components/AppShell";
import ExportImportDropdown from "@/components/ExportImportDropdown";
import { useToast } from "@/components/Toast";
import { getTeams } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

function csvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

export default function ArchiveTeamsPage() {
  const { t } = useLocale();
  const { toast } = useToast();

  const exportTeamsJson = useCallback(async () => {
    try {
      const teams = await getTeams();
      if (teams.length === 0) {
        toast.error(t("archives.teamsExportEmpty"));
        return;
      }
      const blob = new Blob([JSON.stringify(teams, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wroket-teams.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("export.error"));
    }
  }, [t, toast]);

  const exportTeamsCsv = useCallback(async () => {
    try {
      const teams = await getTeams();
      if (teams.length === 0) {
        toast.error(t("archives.teamsExportEmpty"));
        return;
      }
      const header = ["id", "name", "ownerUid", "createdAt", "members"].map(csvCell).join(",");
      const rows = teams.map((tm) =>
        [
          tm.id,
          tm.name,
          tm.ownerUid,
          tm.createdAt,
          tm.members.map((m) => `${m.email}:${m.role}`).join(";"),
        ]
          .map(csvCell)
          .join(","),
      );
      const csv = `${header}\n${rows.join("\n")}`;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wroket-teams.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("export.error"));
    }
  }, [t, toast]);

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.teamsSection")}</h1>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.teamsIntro")}</p>
          </div>
          <div className="shrink-0 flex justify-end">
            <ExportImportDropdown exportCsv={exportTeamsCsv} exportJson={exportTeamsJson} />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
          <p className="text-sm text-zinc-400 dark:text-slate-500 italic">{t("archives.teamsEmpty")}</p>
        </div>
      </div>
    </AppShell>
  );
}
