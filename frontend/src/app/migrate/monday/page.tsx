"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { getTeams, type Team } from "@/lib/api";
import { getProjects, type Project } from "@/lib/api/projects";
import {
  connectMondayOAuth,
  disconnectMondayConnection,
  getConnections,
  type AppConnectionSummary,
} from "@/lib/api/integrations";
import {
  confirmMondayCsvImport,
  confirmMondayDataSync,
  confirmMondayDocsSync,
  confirmMondaySync,
  listMondaySources,
  previewMondayCsvImport,
  previewMondayDataSync,
  previewMondayDocsSync,
  previewMondaySync,
  type MondayDocSyncDiff,
  type MondayDocSyncPreview,
  type MondayImportSource,
  type MondayImportTarget,
  type MondayDataSyncPreview,
  type MondaySyncPreview,
} from "@/lib/api/mondayImport";
import type { DataSyncDiff, SyncDiff, SyncImportMode } from "@/lib/api/notionImport";
import { formatUserFacingError } from "@/lib/apiErrors";

type ImportMode = "api" | "csv";

function sourceKey(s: MondayImportSource): string {
  return `${s.kind}:${s.id}`;
}

function isTargetValid(
  source: MondayImportSource | null,
  target: MondayImportTarget,
  hasDocsScope: boolean,
): boolean {
  if (!source) return false;
  if (target === "project") return source.kind === "board";
  if (target === "document") return source.kind === "doc" && hasDocsScope;
  if (target === "database") {
    return source.kind === "board" || (source.kind === "doc" && Boolean(source.hasTable) && hasDocsScope);
  }
  return false;
}

function sourceKindLabel(kind: MondayImportSource["kind"], t: (k: string) => string): string {
  return kind === "board" ? t("migrate.monday.sourceBoard") : t("migrate.monday.sourceDoc");
}

function SyncDiffSummary({ diff, t }: { diff: SyncDiff; t: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("migrate.monday.diffTitle")}</h3>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">{diff.summary.creates}</div>
          <div className="text-emerald-700/80">{t("migrate.monday.diffCreates")}</div>
        </div>
        <div className="rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-2">
          <div className="font-semibold text-amber-800 dark:text-amber-300">{diff.summary.updates}</div>
          <div className="text-amber-700/80">{t("migrate.monday.diffUpdates")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold text-zinc-700 dark:text-slate-300">{diff.summary.orphans}</div>
          <div className="text-zinc-500">{t("migrate.monday.diffOrphans")}</div>
        </div>
      </div>
    </div>
  );
}

function DataSyncDiffSummary({ diff, t }: { diff: DataSyncDiff; t: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("migrate.monday.dataDiffTitle")}</h3>
      <p className="text-xs text-zinc-500">{diff.database.name}</p>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">{diff.summary.creates}</div>
          <div>{t("migrate.monday.diffCreates")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold text-zinc-700 dark:text-slate-300">{diff.summary.preserved}</div>
          <div>{t("migrate.monday.dataRowsPreserved")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold">{diff.summary.orphans}</div>
          <div>{t("migrate.monday.diffOrphans")}</div>
        </div>
      </div>
    </div>
  );
}

function DocDiffSummary({ diff, t }: { diff: MondayDocSyncDiff; t: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("migrate.monday.docsDiffTitle")}</h3>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">{diff.summary.creates}</div>
          <div className="text-emerald-700/80">{t("migrate.monday.diffCreates")}</div>
        </div>
        <div className="rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-2">
          <div className="font-semibold text-amber-800 dark:text-amber-300">{diff.summary.updates}</div>
          <div className="text-amber-700/80">{t("migrate.monday.diffUpdates")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold text-zinc-700 dark:text-slate-300">{diff.summary.orphans}</div>
          <div className="text-zinc-500">{t("migrate.monday.diffOrphans")}</div>
        </div>
      </div>
    </div>
  );
}

function MondayMigrateContent() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetParam = searchParams.get("target");
  const initialTarget: MondayImportTarget =
    targetParam === "database" || targetParam === "document" ? targetParam : "project";

  const [mode, setMode] = useState<ImportMode>("api");
  const [projectName, setProjectName] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [importMode, setImportMode] = useState<SyncImportMode>("merge");

  const [file, setFile] = useState<File | null>(null);
  const [connections, setConnections] = useState<AppConnectionSummary[]>([]);
  const [sources, setSources] = useState<MondayImportSource[]>([]);
  const [selectedSourceKey, setSelectedSourceKey] = useState("");
  const [importTarget, setImportTarget] = useState<MondayImportTarget>(initialTarget);
  const [docsScopeMissing, setDocsScopeMissing] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [preview, setPreview] = useState<MondaySyncPreview | null>(null);
  const [dataPreview, setDataPreview] = useState<MondayDataSyncPreview | null>(null);

  const [docFolder, setDocFolder] = useState("Monday");
  const [docProjectId, setDocProjectId] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<MondayDocSyncPreview | null>(null);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const mondayConnected = connections.find((c) => c.provider === "monday")?.status === "connected";
  const mondayHasDocsScope = mondayConnected && !docsScopeMissing;

  const selectedSource = useMemo(
    () => sources.find((s) => sourceKey(s) === selectedSourceKey) ?? null,
    [sources, selectedSourceKey],
  );

  const targetValid = isTargetValid(selectedSource, importTarget, mondayHasDocsScope);

  useEffect(() => {
    getTeams().then(setTeams).catch(() => {});
    getProjects().then(setProjects).catch(() => {});
    getConnections().then(setConnections).catch(() => {});
  }, []);

  const loadSources = useCallback(async (quiet = false) => {
    if (!mondayConnected) return;
    try {
      const res = await listMondaySources();
      setSources(res.sources);
      setDocsScopeMissing(res.docsScopeMissing);
      setWorkspaceName(res.workspaceName);
      if (res.sources.length && !selectedSourceKey) {
        const first = res.sources[0];
        setSelectedSourceKey(sourceKey(first));
        setImportTarget(first.suggestedTarget);
        setProjectName(first.name);
        setDatabaseName(first.name);
      }
      if (!quiet) toast.success(t("migrate.monday.sourcesRefreshed"));
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.MONDAY_NOT_CONNECTED"));
    }
  }, [mondayConnected, selectedSourceKey, toast, t]);

  useEffect(() => {
    if (mode === "api" && mondayConnected) void loadSources(true);
  }, [mode, mondayConnected, loadSources]);

  useEffect(() => {
    if (searchParams.get("monday") !== "connected") return;
    toast.success(t("settings.mondayConnectedToast"));
    void loadSources(true);
    router.replace("/migrate/monday", { scroll: false });
  }, [searchParams, toast, t, loadSources, router]);

  useEffect(() => {
    if (targetParam === "database" || targetParam === "document" || targetParam === "project") {
      setImportTarget(targetParam);
    }
  }, [targetParam]);

  useEffect(() => {
    if (!selectedSource) return;
    if (targetParam === "database" || targetParam === "document" || targetParam === "project") return;
    setImportTarget(selectedSource.suggestedTarget);
    setProjectName(selectedSource.name);
    setDatabaseName(selectedSource.name);
  }, [selectedSourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const runPreview = useCallback(async () => {
    setLoading(true);
    setPreview(null);
    setDataPreview(null);
    setDocPreview(null);
    try {
      if (mode === "api") {
        if (!selectedSource || !targetValid) return;

        if (importTarget === "project") {
          const p = await previewMondaySync({
            boardId: selectedSource.id,
            projectName: projectName.trim() || undefined,
            teamId,
            importMode,
          });
          setPreview(p);
          if (!projectName.trim() && p.snapshot?.projectName) setProjectName(p.snapshot.projectName);
          return;
        }

        if (importTarget === "database") {
          const p = await previewMondayDataSync({
            sourceKind: selectedSource.kind,
            sourceId: selectedSource.id,
            databaseName: databaseName.trim() || undefined,
          });
          setDataPreview(p);
          if (!databaseName.trim()) setDatabaseName(p.snapshot.sourceLabel);
          return;
        }

        const p = await previewMondayDocsSync({
          docIds: [selectedSource.id],
          folder: docFolder.trim() || "Monday",
          projectId: docProjectId,
          importMode,
        });
        setDocPreview(p);
        return;
      }

      if (!file) return;
      const p = await previewMondayCsvImport(file, {
        projectName: projectName.trim() || undefined,
        teamId,
        importMode,
      });
      setPreview(p);
      if (!projectName.trim() && p.snapshot?.projectName) setProjectName(p.snapshot.projectName);
    } catch (err) {
      toast.error(
        formatUserFacingError(
          err,
          mode === "api"
            ? "errors.code.MONDAY_API_ERROR"
            : "errors.code.IMPORT_MONDAY_INVALID",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [
    mode,
    selectedSource,
    targetValid,
    importTarget,
    docFolder,
    docProjectId,
    file,
    projectName,
    databaseName,
    teamId,
    importMode,
    toast,
    t,
  ]);

  useEffect(() => {
    if (mode === "csv" && file) void runPreview();
    if (mode === "api" && selectedSourceKey && mondayConnected && targetValid) void runPreview();
  }, [
    mode,
    file,
    selectedSourceKey,
    importTarget,
    teamId,
    importMode,
    docFolder,
    docProjectId,
    databaseName,
    projectName,
    mondayConnected,
    targetValid,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = async () => {
    setSyncing(true);
    try {
      if (mode === "api") {
        if (!selectedSource || !targetValid) return;

        if (importTarget === "project") {
          const result = await confirmMondaySync({
            boardId: selectedSource.id,
            projectName: projectName.trim() || undefined,
            teamId,
            importMode,
          });
          toast.success(t("migrate.monday.syncSuccess"));
          router.push(`/projects?id=${encodeURIComponent(result.project.id)}`);
          return;
        }

        if (importTarget === "database") {
          const result = await confirmMondayDataSync({
            sourceKind: selectedSource.kind,
            sourceId: selectedSource.id,
            databaseName: databaseName.trim() || undefined,
          });
          toast.success(t("migrate.monday.dataSyncSuccess"));
          router.push(`/notes?section=databases&db=${encodeURIComponent(result.databaseId)}`);
          return;
        }

        await confirmMondayDocsSync({
          docIds: [selectedSource.id],
          folder: docFolder.trim() || "Monday",
          projectId: docProjectId,
          importMode,
        });
        toast.success(t("migrate.monday.docsSyncSuccess"));
        router.push("/notes");
        return;
      }

      if (!file) return;
      const result = await confirmMondayCsvImport(file, {
        projectName: projectName.trim() || undefined,
        teamId,
        importMode,
      });
      toast.success(t("migrate.monday.importSuccess"));
      router.push(`/projects?id=${encodeURIComponent(result.project.id)}`);
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.MONDAY_API_ERROR"));
    } finally {
      setSyncing(false);
    }
  };

  const activeDiff =
    mode === "api" && importTarget === "document"
      ? docPreview?.diff
      : mode === "api" && importTarget === "database"
        ? dataPreview?.diff
        : preview?.diff;

  const activeWarnings =
    mode === "api" && importTarget === "document"
      ? docPreview?.mappingReport?.warnings
      : mode === "api" && importTarget === "database"
        ? dataPreview?.mappingReport?.warnings
        : preview?.mappingReport?.warnings;

  const canConfirm =
    Boolean(activeDiff) &&
    !loading &&
    (mode !== "api" || targetValid);

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/settings?tab=integrations" className="text-xs text-zinc-500 hover:underline">
            ← {t("migrate.monday.backSettings")}
          </Link>
          <h1 className="text-xl font-semibold mt-2">{t("migrate.monday.title")}</h1>
          <p className="text-sm text-zinc-600 dark:text-slate-400 mt-1">{t("migrate.monday.hint")}</p>
          <Link
            href="/docs/integrations/monday"
            className="inline-block mt-2 text-sm text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            {t("migrate.monday.docsLink")}
          </Link>
        </div>

        <div className="flex gap-1 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
          {(["api", "csv"] as ImportMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setPreview(null);
                setDataPreview(null);
                setDocPreview(null);
              }}
              className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                mode === m
                  ? "bg-slate-700 dark:bg-slate-600 text-white"
                  : "text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
              }`}
            >
              {m === "api" ? t("migrate.monday.modeApi") : t("migrate.monday.modeCsv")}
            </button>
          ))}
        </div>

        {mode === "api" && !mondayConnected && (
          <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 p-4 space-y-3">
            <p className="text-sm text-violet-900 dark:text-violet-200">{t("migrate.monday.apiHint")}</p>
            <button
              type="button"
              onClick={() => connectMondayOAuth("/migrate/monday")}
              className="rounded-md bg-violet-600 text-white text-sm px-4 py-2 hover:bg-violet-700"
            >
              {t("migrate.monday.connectCta")}
            </button>
          </div>
        )}

        {mode === "api" && mondayConnected && docsScopeMissing && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-medium">{t("migrate.monday.docsScopeMissingTitle")}</p>
            <p className="text-xs">{t("migrate.monday.docsScopeMissingHint")}</p>
            <button
              type="button"
              onClick={() => connectMondayOAuth("/migrate/monday")}
              className="rounded-md bg-amber-700 text-white text-xs px-3 py-1.5 hover:bg-amber-800"
            >
              {t("migrate.monday.reconnectForDocs")}
            </button>
          </div>
        )}

        {mode === "api" && mondayConnected && (
          <div className="space-y-3">
            {workspaceName && (
              <p className="text-xs text-zinc-500">
                {t("migrate.monday.workspace")}: {workspaceName}
              </p>
            )}
            <label className="block text-xs text-zinc-500">{t("migrate.monday.selectSource")}</label>
            <select
              value={selectedSourceKey}
              onChange={(e) => setSelectedSourceKey(e.target.value)}
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
            >
              {sources.map((s) => (
                <option key={sourceKey(s)} value={sourceKey(s)}>
                  [{sourceKindLabel(s.kind, t)}] {s.name}
                  {s.hasTable ? ` · ${t("migrate.monday.hasTable")}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadSources()}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              {t("migrate.monday.refreshSources")}
            </button>

            <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-3 space-y-2">
              <p className="text-xs font-medium text-zinc-700 dark:text-slate-300">{t("migrate.monday.importTarget")}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["project", "database", "document"] as MondayImportTarget[]).map((target) => {
                  const valid = isTargetValid(selectedSource, target, mondayHasDocsScope);
                  const needsDocs = (target === "document" || (target === "database" && selectedSource?.kind === "doc")) && !mondayHasDocsScope;
                  return (
                    <button
                      key={target}
                      type="button"
                      disabled={!valid}
                      onClick={() => setImportTarget(target)}
                      className={`rounded-md px-3 py-1.5 border ${
                        importTarget === target
                          ? "bg-violet-600 text-white border-violet-600"
                          : valid
                            ? "border-zinc-300 dark:border-slate-600 hover:bg-zinc-50 dark:hover:bg-slate-800"
                            : "border-zinc-200 text-zinc-400 cursor-not-allowed opacity-60"
                      }`}
                      title={needsDocs ? t("migrate.monday.docsScopeMissingTitle") : undefined}
                    >
                      {target === "project"
                        ? t("migrate.monday.targetProject")
                        : target === "database"
                          ? t("migrate.monday.targetDatabase")
                          : t("migrate.monday.targetDocument")}
                    </button>
                  );
                })}
              </div>
              {selectedSource && !targetValid && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{t("migrate.monday.targetMismatch")}</p>
              )}
              {selectedSource?.suggestedTarget === importTarget && (
                <p className="text-xs text-zinc-500">{t("migrate.monday.suggestedTarget")}</p>
              )}
            </div>
          </div>
        )}

        {mode === "csv" && (
          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">{t("migrate.monday.csvFile")}</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            <p className="text-xs text-zinc-400">{t("migrate.monday.csvHint")}</p>
          </div>
        )}

        {mode === "api" && importTarget === "project" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.projectName")}</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.teamOptional")}</label>
              <select
                value={teamId ?? ""}
                onChange={(e) => setTeamId(e.target.value || null)}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
              >
                <option value="">{t("migrate.monday.noTeam")}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {mode === "api" && importTarget === "database" && (
          <div>
            <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.databaseName")}</label>
            <input
              type="text"
              value={databaseName}
              onChange={(e) => setDatabaseName(e.target.value)}
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
            />
          </div>
        )}

        {mode === "api" && importTarget === "document" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.folderLabel")}</label>
              <input
                type="text"
                value={docFolder}
                onChange={(e) => setDocFolder(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.projectLinkOptional")}</label>
              <select
                value={docProjectId ?? ""}
                onChange={(e) => setDocProjectId(e.target.value || null)}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
              >
                <option value="">{t("migrate.monday.noProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {mode === "csv" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.projectName")}</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-0.5">{t("migrate.monday.teamOptional")}</label>
              <select
                value={teamId ?? ""}
                onChange={(e) => setTeamId(e.target.value || null)}
                className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm dark:bg-slate-900"
              >
                <option value="">{t("migrate.monday.noTeam")}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {(mode === "csv" || (mode === "api" && importTarget === "project")) && preview?.existingProject && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">{t("migrate.monday.existingProject")}</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">{preview.existingProject.name}</p>
            <div className="mt-2 flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={importMode === "merge"}
                  onChange={() => setImportMode("merge")}
                />
                {t("migrate.monday.importModeMerge")}
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  checked={importMode === "create_new"}
                  onChange={() => setImportMode("create_new")}
                />
                {t("migrate.monday.importModeCreateNew")}
              </label>
            </div>
          </div>
        )}

        {loading && <p className="text-sm text-zinc-500">{t("migrate.monday.previewLoading")}</p>}

        {(mode === "csv" || (mode === "api" && importTarget === "project")) && preview?.snapshot && (
          <p className="text-xs text-zinc-500">
            {preview.snapshot.phaseCount} {t("migrate.monday.phases")} · {preview.snapshot.taskCount}{" "}
            {t("migrate.monday.tasks")}
          </p>
        )}

        {mode === "api" && importTarget === "database" && dataPreview?.snapshot && (
          <p className="text-xs text-zinc-500">
            {dataPreview.snapshot.columnCount} {t("migrate.monday.columns")} · {dataPreview.snapshot.rowCount}{" "}
            {t("migrate.monday.rows")}
          </p>
        )}

        {mode === "api" && importTarget === "document" && docPreview?.snapshot && (
          <p className="text-xs text-zinc-500">
            {docPreview.snapshot.docCount} {t("migrate.monday.docCount")}
          </p>
        )}

        {mode === "api" && importTarget === "database" && dataPreview?.diff && (
          <DataSyncDiffSummary diff={dataPreview.diff} t={t} />
        )}
        {mode === "api" && importTarget === "document" && docPreview?.diff && (
          <DocDiffSummary diff={docPreview.diff} t={t} />
        )}
        {(mode === "csv" || (mode === "api" && importTarget === "project")) && preview?.diff && (
          <SyncDiffSummary diff={preview.diff} t={t} />
        )}

        {activeWarnings?.length ? (
          <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
            {activeWarnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={syncing || !canConfirm}
            onClick={() => void handleConfirm()}
            className="rounded-md bg-violet-600 text-white text-sm px-4 py-2 disabled:opacity-50 hover:bg-violet-700"
          >
            {syncing ? "…" : t("migrate.monday.confirm")}
          </button>
          {mondayConnected && mode === "api" && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await disconnectMondayConnection();
                  setConnections((prev) =>
                    prev.map((c) =>
                      c.provider === "monday"
                        ? { ...c, status: "disconnected", connectedAt: null, workspaceName: null }
                        : c,
                    ),
                  );
                  toast.success(t("settings.mondayDisconnectedToast"));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("toast.genericError"));
                }
              }}
              className="rounded-md border border-zinc-300 dark:border-slate-600 text-sm px-4 py-2"
            >
              {t("settings.connectionDisconnect")}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function MondayMigratePage() {
  return (
    <Suspense fallback={null}>
      <MondayMigrateContent />
    </Suspense>
  );
}
