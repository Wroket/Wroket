"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import AppShell from "@/components/AppShell";
import {
  confirmNotionImport,
  confirmNotionSync,
  confirmNotionContactsSync,
  confirmNotionDataSync,
  listNotionDatabases,
  previewNotionImport,
  previewNotionSync,
  previewNotionContactsSync,
  previewNotionDataSync,
  type NotionImportPreview,
  type NotionSyncPreview,
  type NotionContactsSyncPreview,
  type NotionDataSyncPreview,
  type DataSyncDiff,
  type ContactColumnMapping,
  type ContactFieldTarget,
  type SyncDiff,
  type ContactSyncDiff,
  type SyncImportMode,
  type NotionDatabaseSummary,
} from "@/lib/api/notionImport";
import { getConnections, connectNotionOAuth, type AppConnectionSummary } from "@/lib/api/integrations";
import { getTeams, getProjects, type Team, type Project } from "@/lib/api";
import { formatUserFacingError } from "@/lib/apiErrors";
import {
  filterNotionImportedProjects,
  isNotionProjectLinkedToDatabase,
} from "@/lib/importSourceBadge";

type ImportMode = "zip" | "api";
type ImportTarget = "project" | "contacts" | "data";

function ContactSyncDiffSummary({ diff, t }: { diff: ContactSyncDiff; t: (k: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("migrate.notion.contactsDiffTitle")}</h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">{diff.summary.creates}</div>
          <div className="text-emerald-700/80 dark:text-emerald-400/80">{t("migrate.notion.diffCreates")}</div>
        </div>
        <div className="rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-2">
          <div className="font-semibold text-amber-800 dark:text-amber-300">{diff.summary.updates}</div>
          <div className="text-amber-700/80 dark:text-amber-400/80">{t("migrate.notion.diffUpdates")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold text-zinc-700 dark:text-slate-300">{diff.summary.orphans}</div>
          <div className="text-zinc-500 dark:text-slate-400">{t("migrate.notion.diffOrphans")}</div>
        </div>
      </div>
      {expanded && (
        <div className="space-y-3 text-xs text-zinc-600 dark:text-slate-400 max-h-64 overflow-y-auto">
          <div>
            <p className="font-medium text-zinc-700 dark:text-slate-300">{t("migrate.notion.diffContacts")}</p>
            {diff.contacts.create.slice(0, 20).map((c) => (
              <div key={c.externalId}>+ {c.label}</div>
            ))}
            {diff.contacts.update.slice(0, 20).map((u) => (
              <div key={u.externalId}>
                ~ {u.label} ({u.changedFields?.join(", ")})
              </div>
            ))}
            {diff.contacts.orphans.slice(0, 10).map((o) => (
              <div key={o.internalId}>? {o.label}</div>
            ))}
            {diff.contacts.unchanged > 0 && (
              <div>{diff.contacts.unchanged} {t("migrate.notion.diffUnchanged")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExistingProjectChoice({
  projectName,
  importMode,
  onImportModeChange,
  t,
}: {
  projectName: string;
  importMode: SyncImportMode;
  onImportModeChange: (mode: SyncImportMode) => void;
  t: (k: string) => string;
}) {
  return (
    <div
      role="region"
      aria-label={t("migrate.notion.existingProjectTitle")}
      className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-3"
    >
      <div>
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {t("migrate.notion.existingProjectTitle")}
        </h3>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
          {t("migrate.notion.existingProjectDesc").replace("{name}", projectName)}
        </p>
      </div>
      <div className="space-y-2">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="import-mode"
            checked={importMode === "merge"}
            onChange={() => onImportModeChange("merge")}
            className="mt-1"
          />
          <span className="text-sm text-amber-900 dark:text-amber-100">
            <span className="font-medium">{t("migrate.notion.importModeMerge")}</span>
            <span className="block text-xs text-amber-800/90 dark:text-amber-300/90">
              {t("migrate.notion.importModeMergeHint")}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="import-mode"
            checked={importMode === "create_new"}
            onChange={() => onImportModeChange("create_new")}
            className="mt-1"
          />
          <span className="text-sm text-amber-900 dark:text-amber-100">
            <span className="font-medium">{t("migrate.notion.importModeCreateNew")}</span>
            <span className="block text-xs text-amber-800/90 dark:text-amber-300/90">
              {t("migrate.notion.importModeCreateNewHint")}
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function DataSyncDiffSummary({ diff, t }: { diff: DataSyncDiff; t: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <h3 className="text-sm font-medium">{t("migrate.notion.dataDiffTitle")}</h3>
      <p className="text-xs text-zinc-500">{diff.database.name}</p>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2">
          <div className="font-semibold text-emerald-800">{diff.summary.creates}</div>
          <div>{t("migrate.notion.diffCreates")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold text-zinc-700 dark:text-slate-300">{diff.summary.preserved}</div>
          <div>{t("migrate.notion.dataRowsPreserved")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold">{diff.summary.orphans}</div>
          <div>{t("migrate.notion.diffOrphans")}</div>
        </div>
      </div>
      {diff.summary.preserved > 0 && (
        <p className="text-xs text-zinc-500 dark:text-slate-400">
          {t("migrate.notion.dataRowsPreservedHint")}
        </p>
      )}
    </div>
  );
}

const CONTACT_MAP_TARGETS: ContactFieldTarget[] = [
  "ignore", "firstName", "lastName", "email", "phone", "company", "tags", "notes",
];

function ContactColumnMappingEditor({
  properties,
  mapping,
  onChange,
  t,
}: {
  properties: string[];
  mapping: ContactColumnMapping[];
  onChange: (next: ContactColumnMapping[]) => void;
  t: (k: string) => string;
}) {
  const targetFor = (prop: string): ContactFieldTarget =>
    mapping.find((m) => m.notionProperty === prop)?.target ?? "ignore";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("migrate.notion.contactsMappingTitle")}</h3>
        <p className="text-xs text-zinc-500 dark:text-slate-400 mt-1">{t("migrate.notion.contactsMappingHint")}</p>
      </div>
      <div className="space-y-2 max-h-56 overflow-y-auto">
        {properties.map((prop) => (
          <div key={prop} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="min-w-[120px] font-medium text-zinc-700 dark:text-slate-300 truncate">{prop}</span>
            <select
              value={targetFor(prop)}
              onChange={(e) => {
                const target = e.target.value as ContactFieldTarget;
                const rest = mapping.filter((m) => m.notionProperty !== prop);
                onChange(target === "ignore" ? rest : [...rest, { notionProperty: prop, target }]);
              }}
              className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800"
            >
              {CONTACT_MAP_TARGETS.map((target) => (
                <option key={target} value={target}>
                  {t(`migrate.notion.mapTarget.${target}`)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncDiffSummary({ diff, t }: { diff: SyncDiff; t: (k: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("migrate.notion.diffTitle")}</h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          {expanded ? "−" : "+"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-emerald-50 dark:bg-emerald-950/30 px-2 py-2">
          <div className="font-semibold text-emerald-800 dark:text-emerald-300">{diff.summary.creates}</div>
          <div className="text-emerald-700/80 dark:text-emerald-400/80">{t("migrate.notion.diffCreates")}</div>
        </div>
        <div className="rounded bg-amber-50 dark:bg-amber-950/30 px-2 py-2">
          <div className="font-semibold text-amber-800 dark:text-amber-300">{diff.summary.updates}</div>
          <div className="text-amber-700/80 dark:text-amber-400/80">{t("migrate.notion.diffUpdates")}</div>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-slate-800 px-2 py-2">
          <div className="font-semibold text-zinc-700 dark:text-slate-300">{diff.summary.orphans}</div>
          <div className="text-zinc-500 dark:text-slate-400">{t("migrate.notion.diffOrphans")}</div>
        </div>
      </div>
      {expanded && (
        <div className="space-y-3 text-xs text-zinc-600 dark:text-slate-400 max-h-64 overflow-y-auto">
          <div>
            <p className="font-medium text-zinc-700 dark:text-slate-300">{t("migrate.notion.diffProject")}</p>
            <p>
              {diff.project.action === "create" ? t("migrate.notion.diffCreates") : diff.project.name}
              {diff.project.nameChanged ? ` (${t("migrate.notion.diffUpdates")})` : ""}
            </p>
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-slate-300">{t("migrate.notion.diffPhases")}</p>
            {diff.phases.create.map((c) => (
              <div key={c.externalId}>+ {c.label}</div>
            ))}
            {diff.phases.update.map((u) => (
              <div key={u.externalId}>
                ~ {u.label} ({u.changedFields?.join(", ")})
              </div>
            ))}
            {diff.phases.orphans.map((o) => (
              <div key={o.internalId}>? {o.label}</div>
            ))}
            {diff.phases.unchanged > 0 && (
              <div>{diff.phases.unchanged} {t("migrate.notion.diffUnchanged")}</div>
            )}
          </div>
          <div>
            <p className="font-medium text-zinc-700 dark:text-slate-300">{t("migrate.notion.diffTasks")}</p>
            {diff.tasks.create.slice(0, 20).map((c) => (
              <div key={c.externalId}>+ {c.label}</div>
            ))}
            {diff.tasks.update.slice(0, 20).map((u) => (
              <div key={u.externalId}>
                ~ {u.label} ({u.changedFields?.join(", ")})
              </div>
            ))}
            {diff.tasks.orphans.slice(0, 10).map((o) => (
              <div key={o.internalId}>? {o.label}</div>
            ))}
            {diff.tasks.unchanged > 0 && (
              <div>{diff.tasks.unchanged} {t("migrate.notion.diffUnchanged")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MigrateNotionPage() {
  return (
    <Suspense>
      <MigrateNotionPageContent />
    </Suspense>
  );
}

function MigrateNotionPageContent() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactsModeParam = searchParams.get("mode") === "contacts";
  const dataModeParam = searchParams.get("mode") === "data";
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode>("api");
  const [projectName, setProjectName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  // ZIP
  const [file, setFile] = useState<File | null>(null);
  const [databaseIndex, setDatabaseIndex] = useState(0);
  const [preview, setPreview] = useState<NotionImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // API
  const [connections, setConnections] = useState<AppConnectionSummary[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [apiDatabases, setApiDatabases] = useState<NotionDatabaseSummary[]>([]);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState("");
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [syncPreview, setSyncPreview] = useState<NotionSyncPreview | null>(null);
  const [contactsSyncPreview, setContactsSyncPreview] = useState<NotionContactsSyncPreview | null>(null);
  const [dataSyncPreview, setDataSyncPreview] = useState<NotionDataSyncPreview | null>(null);
  const [contactColumnMapping, setContactColumnMapping] = useState<ContactColumnMapping[]>([]);
  const [importTarget, setImportTarget] = useState<ImportTarget>(
    contactsModeParam ? "contacts" : dataModeParam ? "data" : "project",
  );
  const [apiLoading, setApiLoading] = useState(false);
  const [refreshingDatabases, setRefreshingDatabases] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importMode, setImportMode] = useState<SyncImportMode>("merge");

  const [wroketProjects, setWroketProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [selectedLinkedProjectId, setSelectedLinkedProjectId] = useState<string | null>(null);

  const notionConnected =
    connections.find((c) => c.provider === "notion")?.status === "connected";

  useEffect(() => {
    if (teamsLoaded) return;
    getTeams()
      .then(setTeams)
      .catch(() => {})
      .finally(() => setTeamsLoaded(true));
  }, [teamsLoaded]);

  useEffect(() => {
    if (connectionsLoaded) return;
    getConnections()
      .then(setConnections)
      .catch(() => {})
      .finally(() => setConnectionsLoaded(true));
  }, [connectionsLoaded]);

  useEffect(() => {
    if (projectsLoaded) return;
    getProjects()
      .then(setWroketProjects)
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, [projectsLoaded]);

  const linkedNotionProjects = useMemo(() => {
    if (!selectedDatabaseId) return [];
    return filterNotionImportedProjects(wroketProjects).filter((p) =>
      isNotionProjectLinkedToDatabase(p, selectedDatabaseId),
    );
  }, [wroketProjects, selectedDatabaseId]);

  const applyLinkedProject = useCallback((project: Project) => {
    setSelectedLinkedProjectId(project.id);
    setProjectName(project.name);
    if (project.teamId) setTeamId(project.teamId);
  }, []);

  const handleImportModeChange = useCallback(
    (nextMode: SyncImportMode) => {
      setImportMode(nextMode);
      if (nextMode === "create_new") {
        setSelectedLinkedProjectId(null);
        const db = apiDatabases.find((d) => d.id === selectedDatabaseId);
        const linkedNames = new Set(linkedNotionProjects.map((p) => p.name));
        if (!projectName.trim() || linkedNames.has(projectName)) {
          setProjectName(db?.title ?? "");
        }
        return;
      }
      if (linkedNotionProjects.length > 0) {
        const target =
          linkedNotionProjects.find((p) => p.id === selectedLinkedProjectId) ?? linkedNotionProjects[0];
        applyLinkedProject(target);
      }
    },
    [apiDatabases, selectedDatabaseId, linkedNotionProjects, selectedLinkedProjectId, projectName, applyLinkedProject],
  );

  useEffect(() => {
    if (mode !== "api" || !selectedDatabaseId || importMode === "create_new") return;
    const existing = syncPreview?.existingProject;
    if (existing) {
      const match = linkedNotionProjects.find((p) => p.id === existing.id);
      if (match) {
        if (selectedLinkedProjectId !== match.id) applyLinkedProject(match);
        return;
      }
      if (!selectedLinkedProjectId) {
        setProjectName(existing.name);
        setImportMode("merge");
      }
      return;
    }
    if (linkedNotionProjects.length === 1 && selectedLinkedProjectId !== linkedNotionProjects[0].id) {
      applyLinkedProject(linkedNotionProjects[0]);
    }
  }, [
    mode,
    selectedDatabaseId,
    syncPreview?.existingProject,
    linkedNotionProjects,
    selectedLinkedProjectId,
    applyLinkedProject,
    importMode,
  ]);

  const loadApiDatabases = useCallback(async (opts?: { preserveSelection?: boolean; quiet?: boolean }) => {
    if (!notionConnected) return;
    if (!opts?.quiet) setRefreshingDatabases(true);
    try {
      const res = await listNotionDatabases();
      setApiDatabases(res.databases);
      setWorkspaceName(res.workspaceName);
      const preserveId = opts?.preserveSelection ? selectedDatabaseId : "";
      if (res.databases.length === 0) {
        setSelectedDatabaseId("");
      } else if (preserveId && res.databases.some((d) => d.id === preserveId)) {
        setSelectedDatabaseId(preserveId);
      } else if (!preserveId || !res.databases.some((d) => d.id === preserveId)) {
        const nextId = res.databases[0].id;
        setSelectedDatabaseId(nextId);
        if (!projectName.trim()) setProjectName(res.databases[0].title);
      }
      if (!opts?.quiet) toast.success(t("migrate.notion.databasesRefreshed"));
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.NOTION_NOT_CONNECTED"));
    } finally {
      if (!opts?.quiet) setRefreshingDatabases(false);
    }
  }, [notionConnected, selectedDatabaseId, projectName, toast, t]);

  useEffect(() => {
    if (mode !== "api" || !notionConnected || !connectionsLoaded) return;
    void loadApiDatabases({ preserveSelection: !!selectedDatabaseId, quiet: true });
  }, [mode, notionConnected, connectionsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searchParams.get("notion") !== "connected") return;
    toast.success(t("settings.notionConnectedToast"));
    void loadApiDatabases({ preserveSelection: true, quiet: true });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("notion");
    const qs = params.toString();
    router.replace(qs ? `/migrate/notion?${qs}` : "/migrate/notion", { scroll: false });
  }, [searchParams, toast, t, loadApiDatabases, router]);

  const runZipPreview = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    try {
      const p = await previewNotionImport(file, {
        projectName: projectName.trim() || undefined,
        teamId,
        databaseIndex,
      });
      setPreview(p);
      if (!projectName.trim()) setProjectName(p.suggestedProjectName);
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.IMPORT_NOTION_INVALID"));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [file, projectName, teamId, databaseIndex, toast]);

  useEffect(() => {
    if (mode !== "zip" || !file) {
      if (mode === "zip") setPreview(null);
      return;
    }
    void runZipPreview();
  }, [file, databaseIndex, teamId, mode, runZipPreview]);

  const runApiPreview = useCallback(async () => {
    if (!selectedDatabaseId) return;
    setApiLoading(true);
    try {
      if (importTarget === "contacts") {
        const p = await previewNotionContactsSync({
          databaseId: selectedDatabaseId,
          columnMapping: contactColumnMapping.length ? contactColumnMapping : undefined,
        });
        setContactsSyncPreview(p);
        setSyncPreview(null);
        setDataSyncPreview(null);
      } else if (importTarget === "data") {
        const p = await previewNotionDataSync({ databaseId: selectedDatabaseId });
        setDataSyncPreview(p);
        setSyncPreview(null);
        setContactsSyncPreview(null);
      } else {
        const p = await previewNotionSync({
          databaseId: selectedDatabaseId,
          projectName: projectName.trim() || undefined,
          teamId,
          importMode,
        });
        setSyncPreview(p);
        setContactsSyncPreview(null);
        setDataSyncPreview(null);
        if (!p.blockedAsContacts && !projectName.trim() && p.snapshot?.projectName) {
          setProjectName(p.snapshot.projectName);
        }
      }
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.NOTION_API_ERROR"));
      setSyncPreview(null);
      setContactsSyncPreview(null);
      setDataSyncPreview(null);
    } finally {
      setApiLoading(false);
    }
  }, [selectedDatabaseId, projectName, teamId, importMode, importTarget, contactColumnMapping, toast]);

  useEffect(() => {
    if (mode !== "api" || !selectedDatabaseId || !notionConnected) {
      if (mode === "api") {
        setSyncPreview(null);
        setContactsSyncPreview(null);
        setDataSyncPreview(null);
      }
      return;
    }
    void runApiPreview();
  }, [selectedDatabaseId, teamId, projectName, importMode, importTarget, contactColumnMapping, mode, notionConnected, runApiPreview]);

  useEffect(() => {
    if (contactsModeParam) setImportTarget("contacts");
    else if (dataModeParam) setImportTarget("data");
  }, [contactsModeParam, dataModeParam]);

  const handleZipConfirm = async () => {
    if (!file || !preview || !projectName.trim()) return;
    if (preview.errors.length > 0) return;
    setImporting(true);
    try {
      const result = await confirmNotionImport(file, projectName.trim(), teamId, databaseIndex, importMode);
      let msg = `${t("migrate.notion.success")} — ${result.taskCount} ${t("import.tasks")}`;
      if (result.partialImport && result.skippedForQuota > 0) {
        msg += ` (${result.skippedForQuota} ${t("migrate.notion.skippedQuota")})`;
      }
      toast.success(msg);
      router.push("/projects");
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.IMPORT_NOTION_INVALID"));
    } finally {
      setImporting(false);
    }
  };

  const handleApiConfirm = async () => {
    if (!selectedDatabaseId) return;
    if (importTarget === "contacts") {
      if (!contactsSyncPreview?.diff) return;
      setSyncing(true);
      try {
        const result = await confirmNotionContactsSync({
          databaseId: selectedDatabaseId,
          columnMapping: contactColumnMapping.length ? contactColumnMapping : undefined,
        });
        const count = result.created + result.updated;
        toast.success(`${t("migrate.notion.contactsSyncSuccess")} — ${count} ${t("contacts.countLabel").toLowerCase()}`);
        router.push("/teams?section=contacts");
      } catch (err) {
        toast.error(formatUserFacingError(err, "errors.code.NOTION_CONTACTS_KIND_MISMATCH"));
      } finally {
        setSyncing(false);
      }
      return;
    }
    if (importTarget === "data") {
      if (!dataSyncPreview?.diff) return;
      setSyncing(true);
      try {
        const result = await confirmNotionDataSync({ databaseId: selectedDatabaseId });
        const count = result.rowsCreated;
        toast.success(`${t("migrate.notion.dataSyncSuccess")} — ${count} ${t("notes.databases.addRow").toLowerCase()}`);
        router.push(`/notes?section=databases&db=${result.databaseId}`);
      } catch (err) {
        toast.error(formatUserFacingError(err, "errors.code.NOTION_DATA_KIND_MISMATCH"));
      } finally {
        setSyncing(false);
      }
      return;
    }
    if (!syncPreview || syncPreview.blockedAsContacts || !syncPreview.diff) return;
    setSyncing(true);
    try {
      const result = await confirmNotionSync({
        databaseId: selectedDatabaseId,
        projectName: projectName.trim() || syncPreview.snapshot?.projectName || "",
        teamId,
        importMode,
      });
      const count = result.tasksCreated + result.tasksUpdated;
      toast.success(`${t("migrate.notion.syncSuccess")} — ${count} ${t("import.tasks")}`);
      router.push("/projects");
    } catch (err) {
      toast.error(formatUserFacingError(err, "errors.code.NOTION_DATABASE_KIND_MISMATCH"));
    } finally {
      setSyncing(false);
    }
  };

  const selectedDatabase = useMemo(
    () => apiDatabases.find((d) => d.id === selectedDatabaseId),
    [apiDatabases, selectedDatabaseId],
  );

  useEffect(() => {
    if (!selectedDatabase) return;
    if (selectedDatabase.suggestedKind === "contacts") setImportTarget("contacts");
    else if (selectedDatabase.suggestedKind === "data" && !contactsModeParam) setImportTarget("data");
    else if (selectedDatabase.suggestedKind === "project" && !contactsModeParam && !dataModeParam) setImportTarget("project");
  }, [selectedDatabaseId, selectedDatabase, contactsModeParam, dataModeParam]);

  const isPeopleDatabase = selectedDatabase?.suggestedKind === "contacts";
  const useContactsFlow = importTarget === "contacts";
  const useDataFlow = importTarget === "data";

  const inputClass =
    "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400";

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100">{t("migrate.notion.title")}</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/docs/integrations/notion?section=template"
              className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {t("migrate.notion.docsLink")}
            </Link>
            <button
              type="button"
              onClick={() => router.push("/settings?tab=integrations")}
              className="text-sm text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200"
            >
              {t("migrate.notion.backSettings")}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode("api")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "api"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 dark:bg-slate-800 text-zinc-600 dark:text-slate-400"
            }`}
          >
            {t("migrate.notion.modeApi")}
          </button>
          <button
            type="button"
            onClick={() => setMode("zip")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "zip"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 dark:bg-slate-800 text-zinc-600 dark:text-slate-400"
            }`}
          >
            {t("migrate.notion.modeZip")}
          </button>
        </div>

        {mode === "api" ? (
          <>
            <p className="text-sm text-zinc-600 dark:text-slate-400 mb-6">{t("migrate.notion.apiHint")}</p>
            {!connectionsLoaded ? (
              <p className="text-sm text-zinc-500">{t("migrate.notion.syncPreviewLoading")}</p>
            ) : !notionConnected ? (
              <div className="rounded-lg border border-zinc-200 dark:border-slate-700 p-4">
                <Link
                  href="/settings?tab=integrations"
                  className="text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {t("migrate.notion.connectCta")}
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {workspaceName && (
                  <p className="text-xs text-zinc-500 dark:text-slate-400">
                    {t("migrate.notion.workspace")}: {workspaceName}
                  </p>
                )}
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                    {t("migrate.notion.selectDatabase")}
                  </label>
                  <select
                    value={selectedDatabaseId}
                    onChange={(e) => {
                      const databaseId = e.target.value;
                      setSelectedDatabaseId(databaseId);
                      setSelectedLinkedProjectId(null);
                      setContactColumnMapping([]);
                      const linked = filterNotionImportedProjects(wroketProjects).filter((p) =>
                        isNotionProjectLinkedToDatabase(p, databaseId),
                      );
                      if (linked.length === 1) {
                        applyLinkedProject(linked[0]);
                        return;
                      }
                      const db = apiDatabases.find((d) => d.id === databaseId);
                      setProjectName(db?.title ?? "");
                      setImportMode("merge");
                    }}
                    className={inputClass}
                    disabled={refreshingDatabases || apiDatabases.length === 0}
                  >
                    {apiDatabases.length === 0 ? (
                      <option value="">{t("migrate.notion.refreshDatabases")}</option>
                    ) : (
                      apiDatabases.map((db) => (
                        <option key={db.id} value={db.id}>
                          {db.title}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-slate-400">
                    {t("migrate.notion.missingDatabaseHint")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadApiDatabases({ preserveSelection: true })}
                      disabled={refreshingDatabases || apiLoading}
                      className="text-xs font-medium rounded-md border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      {refreshingDatabases ? t("migrate.notion.refreshDatabasesLoading") : t("migrate.notion.refreshDatabases")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const returnTo = `${window.location.pathname}${window.location.search}`;
                        connectNotionOAuth(returnTo);
                      }}
                      className="text-xs font-medium rounded-md border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    >
                      {t("migrate.notion.extendNotionAccess")}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-400 dark:text-slate-500">
                    {t("migrate.notion.extendNotionAccessHint")}
                  </p>
                </div>
                {isPeopleDatabase && (
                  <div
                    role="status"
                    className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2"
                  >
                    <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      {t("migrate.notion.peopleDatabaseTitle")}
                    </h3>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      {t("migrate.notion.peopleDatabaseBody")}
                    </p>
                  </div>
                )}
                {selectedDatabase?.suggestedKind === "ambiguous" && (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 space-y-3">
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      {t("migrate.notion.ambiguousDatabaseHint")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setImportTarget("contacts")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          importTarget === "contacts"
                            ? "bg-slate-700 text-white"
                            : "border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300"
                        }`}
                      >
                        {t("migrate.notion.importAsContacts")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportTarget("project")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          importTarget === "project"
                            ? "bg-slate-700 text-white"
                            : "border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300"
                        }`}
                      >
                        {t("migrate.notion.importAsProject")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setImportTarget("data")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          importTarget === "data"
                            ? "bg-slate-700 text-white"
                            : "border border-zinc-300 dark:border-slate-600 text-zinc-700 dark:text-slate-300"
                        }`}
                      >
                        {t("migrate.notion.importAsData")}
                      </button>
                    </div>
                  </div>
                )}
                {!useContactsFlow && !useDataFlow && (
                <>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                    {linkedNotionProjects.length > 0 && importMode === "merge"
                      ? t("migrate.notion.selectLinkedProject")
                      : linkedNotionProjects.length > 0 && importMode === "create_new"
                        ? t("migrate.notion.newProjectNameLabel")
                        : t("import.projectName")}
                  </label>
                  {linkedNotionProjects.length > 0 && importMode === "merge" ? (
                    <select
                      value={selectedLinkedProjectId ?? linkedNotionProjects[0]?.id ?? ""}
                      onChange={(e) => {
                        const linked = linkedNotionProjects.find((p) => p.id === e.target.value);
                        if (linked) applyLinkedProject(linked);
                      }}
                      className={inputClass}
                    >
                      {linkedNotionProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder={t("import.projectNamePlaceholder")}
                      className={inputClass}
                      list={linkedNotionProjects.length === 0 ? "notion-imported-project-names" : undefined}
                    />
                  )}
                  {linkedNotionProjects.length === 0 && (
                    <datalist id="notion-imported-project-names">
                      {filterNotionImportedProjects(wroketProjects).map((p) => (
                        <option key={p.id} value={p.name} />
                      ))}
                    </datalist>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                    {t("import.team")}
                  </label>
                  <select value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value || null)} className={inputClass}>
                    <option value="">{t("import.noTeam")}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                </>
                )}
                {apiLoading && (
                  <p className="text-sm text-zinc-500">{t("migrate.notion.syncPreviewLoading")}</p>
                )}
                {useContactsFlow && contactsSyncPreview && !apiLoading && contactsSyncPreview.diff && (
                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-zinc-500 dark:text-slate-400">
                      {contactsSyncPreview.snapshot.sourceLabel} — {contactsSyncPreview.snapshot.contactCount}{" "}
                      {t("contacts.countLabel").toLowerCase()}
                    </p>
                    {contactsSyncPreview.notionProperties && contactsSyncPreview.notionProperties.length > 0 && (
                      <ContactColumnMappingEditor
                        properties={contactsSyncPreview.notionProperties}
                        mapping={contactColumnMapping}
                        onChange={setContactColumnMapping}
                        t={t}
                      />
                    )}
                    {contactsSyncPreview.mappingReport.warnings.length > 0 && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                          {t("migrate.notion.contactsMappingTitle")}
                        </p>
                        <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5 list-disc list-inside">
                          {contactsSyncPreview.mappingReport.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <ContactSyncDiffSummary diff={contactsSyncPreview.diff} t={t} />
                    <button
                      type="button"
                      onClick={handleApiConfirm}
                      disabled={syncing}
                      className="rounded bg-emerald-600 dark:bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 transition-colors"
                    >
                      {syncing
                        ? "…"
                        : `${t("migrate.notion.confirmContactsSync")} (${contactsSyncPreview.diff.summary.creates + contactsSyncPreview.diff.summary.updates} ${t("contacts.countLabel").toLowerCase()})`}
                    </button>
                  </div>
                )}
                {useDataFlow && dataSyncPreview && !apiLoading && dataSyncPreview.diff && (
                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-zinc-500 dark:text-slate-400">
                      {dataSyncPreview.snapshot.sourceLabel} — {dataSyncPreview.snapshot.rowCount}{" "}
                      {t("notes.databases.addRow").toLowerCase()}, {dataSyncPreview.snapshot.columnCount}{" "}
                      {t("notes.databases.addColumn").toLowerCase()}
                    </p>
                    <DataSyncDiffSummary diff={dataSyncPreview.diff} t={t} />
                    <button
                      type="button"
                      onClick={handleApiConfirm}
                      disabled={syncing}
                      className="rounded bg-emerald-600 dark:bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 transition-colors"
                    >
                      {syncing
                        ? "…"
                        : `${t("migrate.notion.confirmDataSync")} (${dataSyncPreview.diff.summary.creates})`}
                    </button>
                  </div>
                )}
                {!useContactsFlow && !useDataFlow && syncPreview && !apiLoading && !syncPreview.blockedAsContacts && syncPreview.diff && (
                  <div className="mt-4 space-y-4">
                    {syncPreview.existingProject && (
                      <ExistingProjectChoice
                        projectName={syncPreview.existingProject.name}
                        importMode={importMode}
                        onImportModeChange={handleImportModeChange}
                        t={t}
                      />
                    )}
                    {syncPreview.mappingReport && (syncPreview.mappingReport.warnings.length > 0 || syncPreview.mappingReport.customFields.length > 0) && (
                      <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50/80 dark:bg-slate-800/40 px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-zinc-700 dark:text-slate-300">
                          {t("migrate.notion.mappingTitle")}
                        </p>
                        {syncPreview.mappingReport.warnings.length > 0 && (
                          <ul className="text-xs text-zinc-600 dark:text-slate-400 space-y-0.5 list-disc list-inside">
                            {syncPreview.mappingReport.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        )}
                        {syncPreview.mappingReport.customFields.length > 0 && (
                          <p className="text-xs text-zinc-500 dark:text-slate-400">
                            {t("migrate.notion.mappingCustom")}:{" "}
                            {syncPreview.mappingReport.customFields
                              .map((c) =>
                                c.type === "select"
                                  ? `${c.name} (${c.optionCount})`
                                  : c.name,
                              )
                              .join(", ")}
                          </p>
                        )}
                      </div>
                    )}
                    <SyncDiffSummary diff={syncPreview.diff} t={t} />
                    <button
                      type="button"
                      onClick={handleApiConfirm}
                      disabled={syncing}
                      className="rounded bg-emerald-600 dark:bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 transition-colors"
                    >
                      {syncing
                        ? "…"
                        : `${t("migrate.notion.confirmSync")} (${syncPreview.diff.summary.creates + syncPreview.diff.summary.updates} ${t("import.tasks")})`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-slate-400 mb-6">{t("migrate.notion.hint")}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                  {t("import.selectFile")}
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setDatabaseIndex(0);
                  }}
                  className={inputClass}
                />
              </div>
              {preview && preview.databases.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                    {t("migrate.notion.database")}
                  </label>
                  <select
                    value={databaseIndex}
                    onChange={(e) => setDatabaseIndex(Number(e.target.value))}
                    className={inputClass}
                  >
                    {preview.databases.map((db) => (
                      <option key={db.index} value={db.index}>
                        {db.name} ({db.taskCount} {t("import.tasks")})
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
                  {t("import.team")}
                </label>
                <select value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value || null)} className={inputClass}>
                  <option value="">{t("import.noTeam")}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {loading && <p className="mt-6 text-sm text-zinc-500">{t("import.previewLoading")}</p>}
            {preview && !loading && (
              <div className="mt-8 space-y-4">
                {preview.existingProject && (
                  <ExistingProjectChoice
                    projectName={preview.existingProject.name}
                    importMode={importMode}
                    onImportModeChange={setImportMode}
                    t={t}
                  />
                )}
                {preview.capacity.partialImport && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                    {t("migrate.notion.partialHint")} ({preview.capacity.tasksImportable}/{preview.capacity.tasksRequested})
                  </div>
                )}
                {!preview.capacity.dependenciesSupported && preview.databases[databaseIndex]?.dependencyCount > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-slate-400">{t("migrate.notion.depsPlanRequired")}</p>
                )}
                <div>
                  <h3 className="text-sm font-medium text-zinc-700 dark:text-slate-300 mb-2">
                    {t("import.phases")} ({preview.phases.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {preview.phases.map((p) => (
                      <span
                        key={p.name}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 font-medium"
                      >
                        {p.name} <span className="text-blue-500 dark:text-blue-400">({p.taskCount})</span>
                      </span>
                    ))}
                  </div>
                </div>
                {preview.errors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
                      {t("import.errors")} ({preview.errors.length})
                    </h3>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {preview.errors.map((err, i) => (
                        <div key={i} className="text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded px-3 py-1.5">
                          {t("import.row")} {err.row} — {err.field}: {err.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {preview.errors.length === 0 && preview.tasks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleZipConfirm}
                    disabled={importing || !projectName.trim()}
                    className="rounded bg-emerald-600 dark:bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 transition-colors"
                  >
                    {importing
                      ? "…"
                      : `${t("import.confirm")} (${preview.capacity.tasksImportable} ${t("import.tasks")})`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
