"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import AppShell from "@/components/AppShell";
import { uploadCsvPreview, confirmCsvImport, getTeams } from "@/lib/api";
import type { ImportPreview, Team } from "@/lib/api";

const CSV_TEMPLATE = `phase,task_title,priority,effort,deadline,start_date,assignee_email,tags
Conception,Design wireframes,high,medium,2026-05-01,2026-04-15,,design,ui
Conception,Maquettes Figma,medium,heavy,2026-05-10,,,design
Développement,API endpoints,high,heavy,2026-06-01,2026-05-10,,backend,api
Développement,Frontend pages,medium,heavy,2026-06-15,2026-05-15,,frontend
Tests,Unit tests,medium,light,2026-06-20,,,tests
Tests,E2E tests,low,medium,2026-06-25,,,tests`;

export default function ImportPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [projectName, setProjectName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadTeams = useCallback(async () => {
    if (teamsLoaded) return;
    try {
      const t = await getTeams();
      setTeams(t);
    } catch { /* ignore */ }
    setTeamsLoaded(true);
  }, [teamsLoaded]);

  // Load teams on first render
  if (!teamsLoaded) loadTeams();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
  };

  const handlePreview = async () => {
    if (!file || !projectName.trim()) return;
    setLoading(true);
    try {
      const p = await uploadCsvPreview(file, projectName.trim());
      setPreview(p);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!file || !projectName.trim() || !preview) return;
    setImporting(true);
    try {
      const result = await confirmCsvImport(file, projectName.trim(), teamId);
      toast.success(`${t("import.success")} — ${result.taskCount} ${t("import.tasks")}`);
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setImporting(false);
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wroket-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  return (
    <AppShell>
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">
          {t("import.title")}
        </h1>
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="text-sm text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200"
        >
          {t("import.back")}
        </button>
      </div>

      <div className="space-y-4">
        {/* Project name */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("import.projectName")}
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={t("import.projectNamePlaceholder")}
            className={inputClass}
          />
        </div>

        {/* Team selector */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("import.team")}
          </label>
          <select
            value={teamId ?? ""}
            onChange={(e) => setTeamId(e.target.value || null)}
            className={inputClass}
          >
            <option value="">{t("import.noTeam")}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>

        {/* File input */}
        <div>
          <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
            {t("import.selectFile")}
          </label>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className={inputClass}
            />
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="whitespace-nowrap rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-xs font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("import.downloadTemplate")}
            </button>
          </div>
        </div>

        {/* Preview button */}
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading || !file || !projectName.trim()}
          className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
        >
          {loading ? "..." : t("import.preview")}
        </button>
      </div>

      {/* Preview results */}
      {preview && (
        <div className="mt-8 space-y-4">
          {/* Phases */}
          <div>
            <h3 className="text-sm font-medium text-zinc-700 dark:text-slate-300 mb-2">
              {t("import.phases")} ({preview.phases.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {preview.phases.map((p) => (
                <span key={p.name} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 font-medium">
                  {p.name} <span className="text-blue-500 dark:text-blue-400">({p.taskCount})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                {t("import.errors")} ({preview.errors.length})
              </h3>
              <div className="space-y-1">
                {preview.errors.map((err, i) => (
                  <div key={i} className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded px-3 py-1.5">
                    {t("import.row")} {err.row} — <span className="font-medium">{err.field}</span>: {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task preview table */}
          {preview.tasks.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-slate-700">
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Phase</th>
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Titre</th>
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Priorité</th>
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Effort</th>
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Deadline</th>
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Assigné</th>
                    <th className="text-left py-2 px-2 text-zinc-500 dark:text-slate-400 font-medium">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.tasks.map((task) => (
                    <tr key={task.row} className="border-b border-zinc-100 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-2 text-zinc-600 dark:text-slate-400">{task.phase}</td>
                      <td className="py-1.5 px-2 text-zinc-900 dark:text-slate-100 font-medium">{task.title}</td>
                      <td className="py-1.5 px-2 text-zinc-600 dark:text-slate-400">{task.priority}</td>
                      <td className="py-1.5 px-2 text-zinc-600 dark:text-slate-400">{task.effort}</td>
                      <td className="py-1.5 px-2 text-zinc-600 dark:text-slate-400">{task.deadline ?? "—"}</td>
                      <td className="py-1.5 px-2 text-zinc-600 dark:text-slate-400">{task.assigneeEmail ?? "—"}</td>
                      <td className="py-1.5 px-2">
                        {task.tags.map((tag) => (
                          <span key={tag} className="inline-block mr-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] px-1.5 py-0.5">{tag}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Import button */}
          {preview.errors.length === 0 && preview.tasks.length > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={importing}
              className="rounded bg-emerald-600 dark:bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 transition-colors"
            >
              {importing ? "..." : `${t("import.confirm")} (${preview.tasks.length} ${t("import.tasks")})`}
            </button>
          )}
        </div>
      )}
    </div>
    </AppShell>
  );
}
