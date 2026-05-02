"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExportImportDropdown from "@/components/ExportImportDropdown";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { deleteTeamApi, getTeams, type Team } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

function csvCell(s: string): string {
  return `"${String(s).replace(/"/g, '""')}"`;
}

type TeamArchiveConfirm =
  | { kind: "delete"; team: Team }
  | { kind: "purge-all"; ids: string[] }
  | { kind: "bulk-delete"; teams: Team[] }
  | null;

const archiveActionBtnBase =
  "inline-flex items-center justify-center rounded border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap";

export default function ArchiveTeamsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const meUid = user?.uid ?? null;

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamConfirm, setTeamConfirm] = useState<TeamArchiveConfirm>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const loadTeams = useCallback(async () => {
    try {
      const data = await getTeams();
      setTeams(data);
    } catch {
      toast.error(t("toast.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const ownedTeams = useMemo(
    () => (meUid ? teams.filter((tm) => tm.ownerUid === meUid) : []),
    [teams, meUid],
  );

  useEffect(() => {
    const visible = new Set(ownedTeams.map((tm) => tm.id));
    setSelectedIds((prev) => {
      let removed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else removed = true;
      }
      return removed ? next : prev;
    });
  }, [ownedTeams]);

  const selectedTeams = useMemo(
    () => ownedTeams.filter((tm) => selectedIds.has(tm.id)),
    [ownedTeams, selectedIds],
  );

  const selectedCount = selectedTeams.length;

  const allVisibleSelected =
    ownedTeams.length > 0 && selectedCount === ownedTeams.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = selectedCount > 0 && !allVisibleSelected;
  }, [selectedCount, allVisibleSelected]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (ownedTeams.length === 0) return prev;
      const allIds = ownedTeams.map((tm) => tm.id);
      const allOn = allIds.every((id) => prev.has(id));
      return allOn ? new Set() : new Set(allIds);
    });
  }, [ownedTeams]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const exportTeamsJson = useCallback(async () => {
    try {
      const data = await getTeams();
      if (data.length === 0) {
        toast.error(t("archives.teamsExportEmpty"));
        return;
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
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
      const data = await getTeams();
      if (data.length === 0) {
        toast.error(t("archives.teamsExportEmpty"));
        return;
      }
      const header = ["id", "name", "ownerUid", "createdAt", "members"].map(csvCell).join(",");
      const rows = data.map((tm) =>
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

  const runDeleteTeam = async (team: Team) => {
    try {
      await deleteTeamApi(team.id);
      setTeams((prev) => prev.filter((x) => x.id !== team.id));
      toast.success(t("archives.teamsDeleted").replace("{count}", "1"));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const runDeleteAllOwned = async (ids: string[]) => {
    try {
      for (const id of ids) {
        await deleteTeamApi(id);
      }
      setTeams((prev) => prev.filter((x) => !ids.includes(x.id)));
      toast.success(t("archives.teamsDeleted").replace("{count}", String(ids.length)));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const runDeleteTeamsBulk = async (list: Team[]) => {
    if (list.length === 0) return;
    const ids = list.map((tm) => tm.id);
    try {
      for (const id of ids) {
        await deleteTeamApi(id);
      }
      setTeams((prev) => prev.filter((x) => !ids.includes(x.id)));
      toast.success(t("archives.teamsDeleted").replace("{count}", String(list.length)));
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  const handleTeamConfirm = () => {
    const c = teamConfirm;
    setTeamConfirm(null);
    if (!c) return;
    void (async () => {
      if (c.kind === "delete") await runDeleteTeam(c.team);
      else if (c.kind === "purge-all") await runDeleteAllOwned(c.ids);
      else if (c.kind === "bulk-delete") {
        await runDeleteTeamsBulk(c.teams);
        clearSelection();
      }
    })();
  };

  const handleBulkDeleteClick = () => {
    if (selectedTeams.length === 0) return;
    setTeamConfirm({ kind: "bulk-delete", teams: selectedTeams });
  };

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{t("archives.teamsSection")}</h1>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("archives.teamsIntro")}</p>
            {ownedTeams.length > 0 && (
              <p className="text-xs text-zinc-500 dark:text-slate-500 mt-2">{t("archives.teamsListHint")}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-wrap justify-end gap-2">
            {ownedTeams.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setTeamConfirm({ kind: "purge-all", ids: ownedTeams.map((x) => x.id) })
                }
                className="rounded border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                {t("archives.emptyTeams")}
              </button>
            )}
            <ExportImportDropdown exportCsv={exportTeamsCsv} exportJson={exportTeamsJson} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          </div>
        ) : ownedTeams.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-10 text-center">
            <p className="text-sm text-zinc-400 dark:text-slate-500 italic">
              {teams.length === 0 ? t("archives.teamsEmpty") : t("archives.teamsNoneOwned")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedCount > 0 && (
              <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/35 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 gap-y-2">
                  <span className="text-xs font-medium text-emerald-900 dark:text-emerald-100 mr-1">
                    {t("bulk.selectedCount").replace("{{count}}", String(selectedCount))}
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDeleteClick}
                    className="inline-flex items-center justify-center shrink-0 text-xs font-medium whitespace-nowrap px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                  >
                    {t("archives.deleteForever")}
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-xs font-medium px-2.5 py-1 rounded-md text-emerald-700 dark:text-emerald-300 hover:underline ml-auto"
                  >
                    {t("bulk.clearSelection")}
                  </button>
                </div>
              </div>
            )}
            <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-slate-800 text-xs text-zinc-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">{t("table.title")}</th>
                  <th className="text-right px-4 py-3 font-medium min-w-[12rem]">{t("table.actions")}</th>
                  <th className="w-10 px-1 py-3 text-center font-medium">
                    <span className="sr-only">{t("table.select")}</span>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAll()}
                      className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                      aria-label={t("a11y.selectAllTasks")}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {ownedTeams.map((tm) => (
                  <tr
                    key={tm.id}
                    className="border-b border-zinc-50 dark:border-slate-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-800 dark:text-slate-200">{tm.name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end sm:gap-2">
                        <button
                          type="button"
                          disabled
                          className={`${archiveActionBtnBase} border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800/50 text-zinc-400 dark:text-slate-500 cursor-not-allowed opacity-70`}
                          title={t("archives.teamsRestoreNotApplicable")}
                        >
                          {t("archives.restore")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setTeamConfirm({ kind: "delete", team: tm })}
                          className={`${archiveActionBtnBase} border-red-500 dark:border-red-500/80 bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`}
                        >
                          {t("archives.deleteForever")}
                        </button>
                      </div>
                    </td>
                    <td className="w-10 px-1 py-3 align-middle text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(tm.id)}
                        onChange={() => toggleSelect(tm.id)}
                        className="rounded border-zinc-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-600 focus:ring-emerald-500"
                        aria-label={t("a11y.selectTaskRow")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={teamConfirm !== null}
          title={
            teamConfirm == null
              ? ""
              : teamConfirm.kind === "delete"
                ? t("archives.confirmDeleteTeamTitle")
                : teamConfirm.kind === "bulk-delete"
                  ? t("archives.bulkDeleteTeamsTitle").replace("{{count}}", String(teamConfirm.teams.length))
                  : t("archives.confirmPurgeTeamsTitle")
          }
          message={
            teamConfirm == null
              ? ""
              : teamConfirm.kind === "delete"
                ? t("archives.deleteTeamConfirm").replace("{name}", teamConfirm.team.name)
                : teamConfirm.kind === "bulk-delete"
                  ? t("archives.bulkDeleteTeamsMessage")
                  : t("archives.emptyTeamsConfirm").replace("{count}", String(teamConfirm.ids.length))
          }
          variant="danger"
          confirmLabel={t("archives.deleteForever")}
          onCancel={() => setTeamConfirm(null)}
          onConfirm={handleTeamConfirm}
        />
      </div>
    </AppShell>
  );
}
