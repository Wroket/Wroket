"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import PageHelpButton from "@/components/PageHelpButton";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import {
  getTeams,
  getTeamPortfolio,
  getPersonalPortfolio,
  type Team,
  type TeamPortfolioProjectRow,
} from "@/lib/api";
import { getHealthConfig } from "@/app/projects/_components/types";

const PERSONAL_SCOPE = "personal";

export default function TeamPortfolioPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teams, setTeams] = useState<Team[]>([]);
  const [scopeId, setScopeId] = useState<string>(PERSONAL_SCOPE);
  const [rows, setRows] = useState<TeamPortfolioProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const healthParam = (searchParams.get("health") ?? "").trim().toLowerCase();
  const atRiskOnly = healthParam === "at-risk" || healthParam === "overdue";

  const setAtRiskOnly = useCallback(
    (on: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (on) params.set("health", "at-risk");
      else params.delete("health");
      const qs = params.toString();
      router.replace(qs ? `/teams/portfolio?${qs}` : "/teams/portfolio", { scroll: false });
    },
    [router, searchParams],
  );

  const healthConfig = useMemo(() => getHealthConfig(t), [t]);
  const visibleRows = useMemo(
    () =>
      atRiskOnly
        ? rows.filter((r) => r.health === "overdue" || r.health === "at-risk" || r.overdueCount > 0)
        : rows,
    [rows, atRiskOnly],
  );

  useEffect(() => {
    getTeams()
      .then((list) => {
        setTeams(list);
        // Solo / no team → personal; otherwise open first team (Personal still in the select).
        setScopeId(list.length === 0 ? PERSONAL_SCOPE : list[0].id);
      })
      .catch(() => toast.error(t("portfolio.loadTeamsError")))
      .finally(() => setLoading(false));
  }, [toast, t]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load =
      scopeId === PERSONAL_SCOPE
        ? getPersonalPortfolio()
        : getTeamPortfolio(scopeId);
    load
      .then((snap) => {
        if (!cancelled) setRows(snap.projects);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          toast.error(t("portfolio.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scopeId, toast, t]);

  const emptyMessage =
    scopeId === PERSONAL_SCOPE ? t("portfolio.emptyPersonal") : t("portfolio.empty");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">{t("portfolio.title")}</h1>
              <PageHelpButton helpId="teamPortfolio" />
            </div>
            <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("portfolio.hint")}</p>
          </div>
          <Link
            href="/projects"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-slate-200"
          >
            {t("portfolio.backProjects")}
          </Link>
        </div>

        <select
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value || PERSONAL_SCOPE)}
          className="rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800"
          aria-label={t("portfolio.scopeLabel")}
        >
          <option value={PERSONAL_SCOPE}>{t("portfolio.scopePersonal")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>

        {loading && <p className="text-sm text-zinc-500">{t("portfolio.loading")}</p>}

        {!loading && rows.length > 0 && (
          <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={atRiskOnly}
              onChange={(e) => setAtRiskOnly(e.target.checked)}
              className="rounded border-zinc-300 dark:border-slate-600"
            />
            {t("projects.filterAtRisk")}
          </label>
        )}

        {!loading && rows.length === 0 && (
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        )}

        {!loading && rows.length > 0 && visibleRows.length === 0 && atRiskOnly && (
          <p className="text-sm text-zinc-500">{t("projects.filterAtRiskEmpty")}</p>
        )}

        {!loading && visibleRows.length > 0 && (
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
                {visibleRows.map((row) => {
                  const hc = healthConfig[row.health];
                  return (
                    <tr key={row.projectId} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50/80 dark:hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/projects?project=${encodeURIComponent(row.projectId)}&tab=pilotage`}
                          className="hover:underline"
                        >
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
