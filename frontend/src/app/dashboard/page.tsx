"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { getTodos, Todo } from "@/lib/api";

type Quadrant = "do-first" | "schedule" | "delegate" | "eliminate";

const URGENCY_THRESHOLD_DAYS = 3;

function classify(todo: Todo): Quadrant {
  const important = todo.priority === "high" || todo.priority === "medium";
  const eff = todo.effort ?? "medium";

  if (todo.deadline) {
    const daysLeft =
      (new Date(todo.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    if (daysLeft <= 1) {
      if (!important && eff === "heavy") return "delegate";
      return "do-first";
    }

    if (daysLeft <= URGENCY_THRESHOLD_DAYS) {
      if (important) return "do-first";
      if (eff === "heavy") return "eliminate";
      return "delegate";
    }
  }

  if (important) return eff === "light" ? "do-first" : "schedule";
  return eff === "light" ? "delegate" : "eliminate";
}

const QUADRANT_LABELS: Record<Quadrant, { label: string; emoji: string; cls: string }> = {
  "do-first": { label: "À faire", emoji: "🔥", cls: "bg-red-500 text-white" },
  schedule:   { label: "Planifier", emoji: "📅", cls: "bg-blue-500 text-white" },
  delegate:   { label: "Expédier", emoji: "⚡", cls: "bg-amber-500 text-white" },
  eliminate:  { label: "Différer", emoji: "⏸️", cls: "bg-emerald-400 text-white" },
};

function deadlineLabel(d: string): { text: string; cls: string; urgent: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { text: "En retard", cls: "text-red-600 dark:text-red-400", urgent: true };
  if (diff === 0) return { text: "Aujourd'hui", cls: "text-red-600 dark:text-red-400", urgent: true };
  if (diff === 1) return { text: "Demain", cls: "text-amber-600 dark:text-amber-400", urgent: true };
  if (diff <= 3) return { text: `${diff}j restants`, cls: "text-amber-600 dark:text-amber-400", urgent: true };
  return { text: target.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), cls: "text-zinc-500 dark:text-slate-400", urgent: false };
}

export default function DashboardPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getTodos();
        if (!cancelled) setTodos(list);
      } catch {
        /* handled by AppShell auth redirect */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const active = todos.filter((t) => t.status === "active");
  const completed = todos.filter((t) => t.status === "completed");

  const grouped: Record<Quadrant, Todo[]> = {
    "do-first": active.filter((t) => classify(t) === "do-first"),
    schedule: active.filter((t) => classify(t) === "schedule"),
    delegate: active.filter((t) => classify(t) === "delegate"),
    eliminate: active.filter((t) => classify(t) === "eliminate"),
  };

  const urgentTodos = active
    .filter((t) => {
      if (!t.deadline) return false;
      const dl = deadlineLabel(t.deadline);
      return dl.urgent;
    })
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 5);

  const recentlyCompleted = completed
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const completionRate = todos.length > 0
    ? Math.round((completed.length / todos.length) * 100)
    : 0;

  return (
    <AppShell>
      <div className="max-w-[1200px] space-y-6">
        {/* ── Title ── */}
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-slate-100">Tableau de bord</h2>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">Vue d&apos;ensemble de vos tâches</p>
        </div>

        {loading ? (
          <p className="text-zinc-400 dark:text-slate-500 text-sm py-8 text-center">Chargement…</p>
        ) : (
          <>
            {/* ── Stats cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Tâches actives" value={active.length} accent="bg-blue-500" />
              <StatCard label="Accomplies" value={completed.length} accent="bg-green-500" />
              <StatCard label="Taux de complétion" value={`${completionRate}%`} accent="bg-violet-500" />
              <StatCard label="En retard" value={active.filter((t) => t.deadline && deadlineLabel(t.deadline).text === "En retard").length} accent="bg-red-500" />
            </div>

            {/* ── Eisenhower summary ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(["do-first", "schedule", "delegate", "eliminate"] as Quadrant[]).map((q) => {
                const info = QUADRANT_LABELS[q];
                return (
                  <div key={q} className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${info.cls}`}>{info.emoji} {info.label}</span>
                    </div>
                    <p className="text-3xl font-bold text-zinc-900 dark:text-slate-100">{grouped[q].length}</p>
                    <p className="text-xs text-zinc-400 dark:text-slate-500 mt-1">
                      {grouped[q].length === 0 ? "Aucune tâche" : `${grouped[q].length} tâche${grouped[q].length > 1 ? "s" : ""}`}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── Urgent tasks ── */}
              <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Échéances proches
                </h3>
                {urgentTodos.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500">Aucune échéance urgente</p>
                ) : (
                  <ul className="space-y-3">
                    {urgentTodos.map((todo) => {
                      const dl = deadlineLabel(todo.deadline!);
                      const badge = QUADRANT_LABELS[classify(todo)];
                      return (
                        <li key={todo.id} className="flex items-center gap-3">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.label}</span>
                          <span className="text-sm text-zinc-800 dark:text-slate-200 truncate flex-1">{todo.title}</span>
                          <span className={`text-xs font-medium shrink-0 ${dl.cls}`}>{dl.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {active.filter((t) => t.deadline && deadlineLabel(t.deadline).urgent).length > 5 && (
                  <a href="/todos" className="block text-xs text-blue-600 dark:text-blue-400 mt-3 hover:underline">Voir toutes les tâches →</a>
                )}
              </div>

              {/* ── Recently completed ── */}
              <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Dernières tâches accomplies
                </h3>
                {recentlyCompleted.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-slate-500">Aucune tâche accomplie</p>
                ) : (
                  <ul className="space-y-3">
                    {recentlyCompleted.map((todo) => (
                      <li key={todo.id} className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-sm text-zinc-500 dark:text-slate-400 line-through truncate flex-1">{todo.title}</span>
                        <span className="text-xs text-zinc-400 dark:text-slate-500 shrink-0">
                          {new Date(todo.updatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Quick link ── */}
            <div className="flex gap-3">
              <a
                href="/todos"
                className="inline-flex items-center gap-2 rounded bg-zinc-900 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-zinc-800 dark:hover:bg-slate-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Gérer mes tâches
              </a>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-md border border-zinc-200 dark:border-slate-700 p-4 flex items-start gap-3">
      <div className={`w-2 h-10 rounded-full ${accent} shrink-0`} />
      <div>
        <p className="text-2xl font-bold text-zinc-900 dark:text-slate-100">{value}</p>
        <p className="text-xs text-zinc-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}
