"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { getTeams, getTeamPortfolio, type Team, type TeamPortfolioProjectRow } from "@/lib/api";
import { getHealthConfig } from "@/app/projects/_components/types";

export default function TeamPortfolioPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [rows, setRows] = useState<TeamPortfolioProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const healthConfig = useMemo(() => getHealthConfig(t), [t]);

  useEffect(() => {
    getTeams()
      .then((list) => {
        setTeams(list);
        if (list.length > 0) setTeamId(list[0].id);
      })
      .catch(() => toast.error(t("portfolio.loadTeamsError")))
      .finally(() => setLoading(false));
  }, [toast, t]);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    getTeamPortfolio(teamId)
      .then((snap) => setRows(snap.projects))
      .catch(() => toast.error(t("portfolio.loadError")))
      .finally(() => setLoading(false));
  }, [teamId, toast, t]);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">{t("portfolio.title")}</h1>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("portfolio.hint")}</p>
          </div>
          <Link
            href="/teams/dashboard"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-slate-200"
          >
            {t("portfolio.backDashboard")}
          </Link>
        </div>

        {teams.length > 1 && (
          <select
            value={teamId ?? ""}
            onChange={(e) => setTeamId(e.target.value || null)}
            className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        )}

        {loading && <p className="text-sm text-zinc-500">{t("portfolio.loading")}</p>}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-zinc-500">{t("portfolio.empty")}</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-900/50 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2 font-medium">{t("portfolio.colProject")}</th>
                  <th className="px-3 py-2 font-medium">{t("portfolio.colHealth")}</th>
                  <th className="px-3 py-2 font-medium">{t("portfolio.colProgress")}</th>
                  <th className="px-3 py-2 font-medium">{t("portfolio.colOverdue")}</th>
                  <th className="px-3 py-2 font-medium">{t("portfolio.colMilestone")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hc = healthConfig[row.health];
                  return (
                    <tr key={row.projectId} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50/80 dark:hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-medium">
                        <Link href={`/projects`} className="hover:underline">
                          {row.projectName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${hc.bg} ${hc.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${hc.ring}`} />
                          {hc.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-slate-400">
                        {row.completionRatio !== null ? `${row.completionRatio}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-600 dark:text-slate-400">{row.overdueCount}</td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {row.nextMilestone
                          ? `${row.nextMilestone.phaseName} (${row.nextMilestone.daysLeft}j)`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
