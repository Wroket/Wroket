"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import { SoftLock, SoftLockHint } from "@/components/SoftLock";
import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";
import { API_BASE_URL, apiFetchDefaults } from "@/lib/api/core";
import { getTeams, type Team } from "@/lib/api";

interface CapacityMemberRow {
  uid: string;
  email: string;
  estimatedMinutes: number;
  trackedMinutes: number;
  overload: boolean;
}

interface CapacityWeekSnapshot {
  teamId: string;
  weekStart: string;
  weekEnd: string;
  weeklyCapacityMinutes: number;
  members: CapacityMemberRow[];
}

export default function TeamCapacityPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const params = useSearchParams();
  const canUse = !!user?.entitlements?.teamReporting || !!user?.earlyBird;
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState(params.get("teamId") ?? "");
  const [snap, setSnap] = useState<CapacityWeekSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getTeams()
      .then((list) => {
        setTeams(list);
        if (!teamId && list[0]) setTeamId(list[0].id);
      })
      .catch(() => setTeams([]));
  }, [teamId]);

  const load = useCallback(async () => {
    if (!canUse || !teamId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/teams/${encodeURIComponent(teamId)}/capacity`, {
        ...apiFetchDefaults,
        method: "GET",
      });
      if (!res.ok) throw new Error("capacity");
      setSnap((await res.json()) as CapacityWeekSnapshot);
    } catch {
      setSnap(null);
    } finally {
      setLoading(false);
    }
  }, [canUse, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtH = (mins: number) => `${(mins / 60).toFixed(1)}h`;
  const heat = (mins: number, cap: number) => {
    const pct = Math.min(100, Math.round((mins / Math.max(1, cap)) * 100));
    if (pct > 100 || mins > cap) return "bg-red-500";
    if (pct > 80) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">{t("capacity.title")}</h1>
            <p className="text-sm text-zinc-500">{t("capacity.subtitle")}</p>
          </div>
          <Link href="/teams/dashboard" className="text-xs text-emerald-700 underline">
            {t("capacity.backDashboard")}
          </Link>
        </div>

        <SoftLock locked={!canUse} tier="large">
          {!canUse && <SoftLockHint tier="large" className="mb-4" />}
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="mb-4 rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
          >
            {teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>

          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !snap ? (
            <p className="text-sm text-zinc-400">{t("capacity.empty")}</p>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-3">
                {snap.weekStart} → {snap.weekEnd} · {t("capacity.cap")}:{" "}
                {fmtH(snap.weeklyCapacityMinutes)}
              </p>
              {snap.members.some((m) => m.overload) && (
                <p className="text-sm text-red-600 mb-3">{t("capacity.overloadAlert")}</p>
              )}
              <ul className="space-y-3">
                {snap.members.map((m) => (
                  <li key={m.uid} className="rounded-lg border border-zinc-200 dark:border-slate-700 p-3">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium truncate">{m.email}</span>
                      <span className={m.overload ? "text-red-600 font-semibold" : "text-zinc-500"}>
                        {fmtH(m.estimatedMinutes)} / {fmtH(m.trackedMinutes)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-zinc-400 mb-1">{t("capacity.estimated")}</p>
                        <div className="h-2 rounded bg-zinc-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded ${heat(m.estimatedMinutes, snap.weeklyCapacityMinutes)}`}
                            style={{
                              width: `${Math.min(100, (m.estimatedMinutes / snap.weeklyCapacityMinutes) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 mb-1">{t("capacity.tracked")}</p>
                        <div className="h-2 rounded bg-zinc-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded ${heat(m.trackedMinutes, snap.weeklyCapacityMinutes)}`}
                            style={{
                              width: `${Math.min(100, (m.trackedMinutes / snap.weeklyCapacityMinutes) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SoftLock>
      </div>
    </AppShell>
  );
}
