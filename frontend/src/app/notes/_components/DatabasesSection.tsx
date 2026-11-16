"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import ConfirmDialog from "@/components/ConfirmDialog";
import PageHelpButton from "@/components/PageHelpButton";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";
import { ApiClientError, formatUserFacingError } from "@/lib/apiErrors";
import { getImportSourceBadge } from "@/lib/importSourceBadge";
import { getTeams, type Team } from "@/lib/api";
import { useDatabasePresence } from "@/hooks/useDatabasePresence";
import {
  createDatabaseRow,
  createUserDatabase,
  deleteDatabaseRow,
  deleteUserDatabase,
  getUserDatabase,
  listDatabaseRevisions,
  listSharedUserDatabases,
  listUserDatabases,
  restoreDatabaseRevision,
  updateUserDatabase,
  updateDatabaseRow,
  type DatabaseColumnDef,
  type DatabaseColumnType,
  type DatabaseRevisionMeta,
  type DatabaseRow,
  type UserDatabase,
} from "@/lib/api/userDatabases";

interface DatabasesSectionProps {
  initialDatabaseId?: string | null;
  /** List/open databases shared with the current user. */
  sharedMode?: boolean;
  onBack: () => void;
}

interface RowConflictState {
  row: DatabaseRow;
  colId: string;
  value: string | number | boolean | null;
  serverRow: DatabaseRow;
}

const ADDABLE_COLUMN_TYPES: DatabaseColumnType[] = [
  "text", "number", "date", "select", "checkbox", "email", "phone",
];

function formatDbDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function DatabasesSection({
  initialDatabaseId,
  sharedMode = false,
  onBack,
}: DatabasesSectionProps) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const router = useRouter();
  const [databases, setDatabases] = useState<UserDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialDatabaseId ?? null);
  const [rows, setRows] = useState<DatabaseRow[]>([]);
  const [canWrite, setCanWrite] = useState(true);
  const [dbLoading, setDbLoading] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [showNewDb, setShowNewDb] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "board" | "calendar">("table");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [editingDbName, setEditingDbName] = useState(false);
  const [dbNameDraft, setDbNameDraft] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<DatabaseColumnType>("text");
  const [newColumnOptions, setNewColumnOptions] = useState("A, B");
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [deleteColumnTarget, setDeleteColumnTarget] = useState<DatabaseColumnDef | null>(null);
  const [deleteDbTarget, setDeleteDbTarget] = useState<UserDatabase | null>(null);
  const [relationRowsCache, setRelationRowsCache] = useState<Record<string, DatabaseRow[]>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareCanWrite, setShareCanWrite] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<DatabaseRevisionMeta[]>([]);
  const [cellCursor, setCellCursor] = useState<{ rowId: string; columnId: string } | null>(null);
  const [rowConflict, setRowConflict] = useState<RowConflictState | null>(null);

  const isOwner = !!(
    selectedId &&
    authUser?.uid &&
    databases.find((d) => d.id === selectedId)?.ownerUid === authUser.uid
  );

  const { presence } = useDatabasePresence(selectedId, {
    displayName: authUser?.email ?? undefined,
    cursor: cellCursor,
    enabled: !!selectedId,
  });

  const peerByCell = useMemo(() => {
    const map = new Map<string, { uid: string; displayName: string }>();
    for (const p of presence) {
      if (p.cursor?.rowId && p.cursor?.columnId) {
        map.set(`${p.cursor.rowId}:${p.cursor.columnId}`, {
          uid: p.uid,
          displayName: p.displayName,
        });
      }
    }
    return map;
  }, [presence]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [rows],
  );

  const inputCls =
    "w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800";

  const refreshList = useCallback(async () => {
    try {
      setDatabases(sharedMode ? await listSharedUserDatabases() : await listUserDatabases());
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setLoading(false);
    }
  }, [toast, sharedMode]);

  const loadDatabase = useCallback(async (id: string) => {
    setDbLoading(true);
    try {
      const res = await getUserDatabase(id);
      setRows(res.rows);
      setCanWrite(res.canWrite !== false);
      setViewMode(res.database.defaultView);
      setShareEmail(res.database.sharedWithEmail ?? "");
      setShareCanWrite(!!res.database.collaboratorWrite);
      setDatabases((prev) => {
        const idx = prev.findIndex((d) => d.id === id);
        if (idx === -1) return [res.database, ...prev];
        return prev.map((d) => (d.id === id ? res.database : d));
      });
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setDbLoading(false);
    }
  }, [toast]);

  useEffect(() => { void refreshList(); }, [refreshList]);
  useEffect(() => {
    getTeams().then(setTeams).catch(() => setTeams([]));
  }, []);
  useEffect(() => {
    if (selectedId) void loadDatabase(selectedId);
    else {
      setRows([]);
      setCanWrite(true);
    }
  }, [selectedId, loadDatabase]);
  useEffect(() => {
    setSelectedId(initialDatabaseId ?? null);
  }, [initialDatabaseId]);

  const selectedDb = useMemo(() => databases.find((d) => d.id === selectedId) ?? null, [databases, selectedId]);

  const sortedDatabases = useMemo(
    () => [...databases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [databases],
  );

  const openDatabase = useCallback((id: string) => {
    setSelectedId(id);
    const sharedQ = sharedMode ? "&shared=1" : "";
    router.replace(`/notes?section=databases&db=${encodeURIComponent(id)}${sharedQ}`, { scroll: false });
  }, [router, sharedMode]);

  const backToList = useCallback(() => {
    setSelectedId(null);
    setRows([]);
    setShowAddColumn(false);
    setCellCursor(null);
    router.replace(sharedMode ? "/notes?section=databases&shared=1" : "/notes?section=databases", {
      scroll: false,
    });
  }, [router, sharedMode]);

  const loadRevisions = useCallback(async () => {
    if (!selectedId) return;
    try {
      setRevisions(await listDatabaseRevisions(selectedId));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  }, [selectedId, toast]);

  const handleCreateDb = async () => {
    const name = newDbName.trim();
    if (!name) return;
    try {
      const db = await createUserDatabase({
        name,
        columns: [{ id: crypto.randomUUID(), name: t("notes.databases.defaultColumn"), type: "text" }],
      });
      setDatabases((prev) => [db, ...prev]);
      openDatabase(db.id);
      setNewDbName("");
      setShowNewDb(false);
      toast.success(t("notes.databases.created"));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const handleAddColumn = () => {
    setNewColumnName("");
    setNewColumnType("text");
    setNewColumnOptions("A, B");
    setShowAddColumn(true);
  };

  const confirmAddColumn = async () => {
    if (!selectedDb) return;
    const name = newColumnName.trim();
    if (!name) return;
    const options =
      newColumnType === "select"
        ? newColumnOptions
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean)
        : undefined;
    const col: DatabaseColumnDef = {
      id: crypto.randomUUID(),
      name,
      type: newColumnType,
      ...(options && options.length > 0 ? { options } : newColumnType === "select" ? { options: ["A", "B"] } : {}),
    };
    try {
      const updated = await updateUserDatabase(selectedDb.id, { columns: [...selectedDb.columns, col] });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setShowAddColumn(false);
      setNewColumnName("");
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const handleDeleteColumn = async () => {
    if (!selectedDb || !deleteColumnTarget || selectedDb.columns.length <= 1) return;
    const columns = selectedDb.columns.filter((c) => c.id !== deleteColumnTarget.id);
    try {
      const updated = await updateUserDatabase(selectedDb.id, { columns });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setRows((prev) =>
        prev.map((row) => {
          const values = { ...row.values };
          delete values[deleteColumnTarget.id];
          return { ...row, values };
        }),
      );
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setDeleteColumnTarget(null);
    }
  };

  const startRenameDatabase = () => {
    if (!selectedDb) return;
    setDbNameDraft(selectedDb.name);
    setEditingDbName(true);
  };

  const commitRenameDatabase = async () => {
    if (!selectedDb) return;
    const name = dbNameDraft.trim();
    if (!name) {
      setEditingDbName(false);
      return;
    }
    try {
      const updated = await updateUserDatabase(selectedDb.id, { name });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setEditingDbName(false);
    }
  };

  const handleDeleteDatabase = async () => {
    if (!deleteDbTarget) return;
    try {
      await deleteUserDatabase(deleteDbTarget.id);
      setDatabases((prev) => prev.filter((d) => d.id !== deleteDbTarget.id));
      if (selectedId === deleteDbTarget.id) {
        backToList();
      }
      toast.success(t("notes.databases.deleted"));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setDeleteDbTarget(null);
    }
  };

  const handleAddRow = async () => {
    if (!selectedDb) return;
    try {
      const row = await createDatabaseRow(selectedDb.id, {});
      setRows((prev) => [...prev, row]);
      setFocusRowId(row.id);
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  useEffect(() => {
    if (!focusRowId) return;
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-db-row-id="${focusRowId}"] input, [data-db-row-id="${focusRowId}"] select, [data-db-row-id="${focusRowId}"] button, [data-db-row-id="${focusRowId}"] [tabindex]`,
      );
      el?.focus();
      setFocusRowId(null);
    }, 50);
    return () => window.clearTimeout(timer);
  }, [focusRowId, rows]);

  const startRenameColumn = (col: DatabaseColumnDef) => {
    setEditingColumnId(col.id);
    setEditingColumnName(col.name);
  };

  const commitRenameColumn = async () => {
    if (!selectedDb || !editingColumnId) return;
    const name = editingColumnName.trim();
    if (!name) {
      setEditingColumnId(null);
      return;
    }
    const columns = selectedDb.columns.map((c) =>
      c.id === editingColumnId ? { ...c, name } : c,
    );
    try {
      const updated = await updateUserDatabase(selectedDb.id, { columns });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    } finally {
      setEditingColumnId(null);
      setEditingColumnName("");
    }
  };

  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const handleColumnDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!selectedDb || !over || active.id === over.id) return;
    const oldIndex = selectedDb.columns.findIndex((c) => c.id === active.id);
    const newIndex = selectedDb.columns.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const columns = arrayMove(selectedDb.columns, oldIndex, newIndex);
    setDatabases((prev) =>
      prev.map((d) => (d.id === selectedDb.id ? { ...d, columns } : d)),
    );
    try {
      const updated = await updateUserDatabase(selectedDb.id, { columns });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      setDatabases((prev) =>
        prev.map((d) => (d.id === selectedDb.id ? selectedDb : d)),
      );
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const handleCellChange = async (row: DatabaseRow, colId: string, value: string | number | boolean | null) => {
    if (!selectedDb || !canWrite) return;
    try {
      const updated = await updateDatabaseRow(selectedDb.id, row.id, { [colId]: value }, {
        baseUpdatedAt: row.updatedAt,
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409 && err.code === "ROW_CONFLICT") {
        const serverRow = (err.details as { row?: DatabaseRow } | undefined)?.row;
        if (serverRow) {
          setRowConflict({ row, colId, value, serverRow });
          return;
        }
      }
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const resolveRowConflict = async (mode: "reload" | "force") => {
    if (!selectedDb || !rowConflict) return;
    if (mode === "reload") {
      setRows((prev) =>
        prev.map((r) => (r.id === rowConflict.serverRow.id ? rowConflict.serverRow : r)),
      );
      setRowConflict(null);
      return;
    }
    try {
      const updated = await updateDatabaseRow(
        selectedDb.id,
        rowConflict.row.id,
        { [rowConflict.colId]: rowConflict.value },
        { force: true },
      );
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setRowConflict(null);
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const calendarGroups = useMemo(() => {
    if (!selectedDb || viewMode !== "calendar") return [];
    const dateCol = selectedDb.columns.find((c) => c.type === "date");
    if (!dateCol) return [];
    const groups = new Map<string, DatabaseRow[]>();
    for (const row of sortedRows) {
      const raw = row.values[dateCol.id];
      const key = typeof raw === "string" && raw ? raw : "—";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)))
      .map(([date, groupRows]) => ({ date, rows: groupRows }));
  }, [selectedDb, sortedRows, viewMode]);

  const loadRelationRows = useCallback(async (databaseId: string) => {
    if (relationRowsCache[databaseId]) return relationRowsCache[databaseId];
    try {
      const res = await getUserDatabase(databaseId);
      setRelationRowsCache((prev) => ({ ...prev, [databaseId]: res.rows }));
      return res.rows;
    } catch {
      return [];
    }
  }, [relationRowsCache]);

  const handleAddRelationColumn = async () => {
    if (!selectedDb || databases.length < 2) return;
    const target = databases.find((d) => d.id !== selectedDb.id);
    if (!target) return;
    const col: DatabaseColumnDef = {
      id: crypto.randomUUID(),
      name: t("notes.databases.relationColumn"),
      type: "relation",
      relationDatabaseId: target.id,
    };
    try {
      const updated = await updateUserDatabase(selectedDb.id, { columns: [...selectedDb.columns, col] });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const boardGroups = useMemo(() => {
    if (!selectedDb || viewMode !== "board") return [];
    const groupCol = selectedDb.columns.find((c) => c.id === selectedDb.boardGroupColumnId)
      ?? selectedDb.columns.find((c) => c.type === "select");
    if (!groupCol) return [];
    const ungrouped = t("notes.databases.boardUngrouped");
    const opts = groupCol.options?.length ? [...groupCol.options, ungrouped] : [ungrouped];
    return opts.map((label) => ({
      label,
      rows: sortedRows.filter((r) => {
        const v = r.values[groupCol.id] as string | null;
        if (label === ungrouped) return !v;
        return v === label;
      }),
    }));
  }, [selectedDb, sortedRows, viewMode, t]);

  const handleSetBoardView = async () => {
    if (!selectedDb) return;
    const groupCol = selectedDb.columns.find((c) => c.type === "select");
    try {
      const updated = await updateUserDatabase(selectedDb.id, {
        defaultView: "board",
        boardGroupColumnId: groupCol?.id ?? null,
      });
      setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setViewMode("board");
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.genericError"));
    }
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={deleteColumnTarget != null}
        title={t("notes.databases.deleteColumn")}
        message={
          deleteColumnTarget
            ? t("notes.databases.deleteColumnConfirm").replace("{name}", deleteColumnTarget.name)
            : ""
        }
        confirmLabel={t("contacts.delete")}
        variant="danger"
        onConfirm={() => void handleDeleteColumn()}
        onCancel={() => setDeleteColumnTarget(null)}
      />
      <ConfirmDialog
        open={deleteDbTarget != null}
        title={t("notes.databases.deleteDatabase")}
        message={
          deleteDbTarget
            ? t("notes.databases.deleteDatabaseConfirm").replace("{name}", deleteDbTarget.name)
            : ""
        }
        confirmLabel={t("contacts.delete")}
        variant="danger"
        onConfirm={() => void handleDeleteDatabase()}
        onCancel={() => setDeleteDbTarget(null)}
      />
      {rowConflict && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 p-4 space-y-3 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
              {t("notes.databases.rowConflictTitle")}
            </h3>
            <p className="text-sm text-zinc-600 dark:text-slate-300">
              {t("notes.databases.rowConflictBody")}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-slate-600"
                onClick={() => setRowConflict(null)}
              >
                {t("teams.cancel")}
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-slate-600"
                onClick={() => void resolveRowConflict("reload")}
              >
                {t("notes.databases.rowConflictReload")}
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md bg-emerald-600 text-white"
                onClick={() => void resolveRowConflict("force")}
              >
                {t("notes.databases.rowConflictForce")}
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddColumn && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddColumn(false);
          }}
        >
          <div className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 p-4 space-y-3 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
              {t("notes.databases.addColumnTitle")}
            </h3>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.databases.columnName")}</span>
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmAddColumn();
                  if (e.key === "Escape") setShowAddColumn(false);
                }}
                autoFocus
                className={`${inputCls} w-full text-sm`}
                placeholder={t("notes.databases.columnNamePlaceholder")}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.databases.columnType")}</span>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value as DatabaseColumnType)}
                className={`${inputCls} w-full text-sm`}
                aria-label={t("notes.databases.columnType")}
              >
                {ADDABLE_COLUMN_TYPES.map((type) => (
                  <option key={type} value={type}>{t(`notes.databases.columnType.${type}`)}</option>
                ))}
              </select>
            </label>
            {newColumnType === "select" && (
              <label className="block space-y-1">
                <span className="text-xs text-zinc-500 dark:text-slate-400">{t("notes.databases.columnOptions")}</span>
                <input
                  type="text"
                  value={newColumnOptions}
                  onChange={(e) => setNewColumnOptions(e.target.value)}
                  className={`${inputCls} w-full text-sm`}
                  placeholder={t("notes.databases.columnOptionsPlaceholder")}
                />
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md border border-zinc-300 dark:border-slate-600"
                onClick={() => setShowAddColumn(false)}
              >
                {t("teams.cancel")}
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded-md bg-emerald-600 text-white disabled:opacity-50"
                disabled={!newColumnName.trim()}
                onClick={() => void confirmAddColumn()}
              >
                {t("notes.databases.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const newDbForm = showNewDb && (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <input type="text" value={newDbName} onChange={(e) => setNewDbName(e.target.value)} placeholder={t("notes.databases.namePlaceholder")} className={`${inputCls} max-w-xs`} />
      <button type="button" onClick={() => void handleCreateDb()} className="text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md shadow-sm shadow-emerald-500/20">{t("notes.databases.create")}</button>
      <button type="button" onClick={() => setShowNewDb(false)} className="text-sm text-zinc-500">{t("teams.cancel")}</button>
    </div>
  );

  if (!selectedId) {
    return (
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onBack} className="rounded-lg p-2 text-zinc-400 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300 transition-colors" aria-label={t("projects.backToList")}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-slate-100">
                {sharedMode ? t("notes.databases.sharedTitle") : t("notes.databases.sectionPath")}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-slate-400 mt-0.5">
                {sharedMode ? t("notes.databases.sharedHint") : t("notes.databases.hint")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PageHelpButton helpId="notes.databases" iconOnly />
            {!sharedMode && (
              <>
                <Link
                  href="/notes?section=databases&shared=1"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300"
                >
                  {t("notes.databases.sharedLink")}
                </Link>
                <Link
                  href="/migrate/notion?mode=data"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
                >
                  {t("notes.databases.importNotion")}
                </Link>
                <button type="button" onClick={() => setShowNewDb(true)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/25">
                  {t("notes.databases.add")}
                </button>
              </>
            )}
          </div>
        </div>

        {!sharedMode && newDbForm}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : databases.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm text-zinc-500">
              {sharedMode ? t("notes.databases.sharedEmpty") : t("notes.databases.empty")}
            </p>
            {!sharedMode && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewDb(true)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
              >
                {t("notes.databases.add")}
              </button>
              <Link
                href="/migrate/notion?mode=data"
                className="rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
              >
                {t("notes.databases.importNotion")}
              </Link>
              <Link
                href="/archive/data/databases"
                className="rounded-lg border border-zinc-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
              >
                {t("archives.data.hubTitle")}
              </Link>
            </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedDatabases.map((db) => {
              const badge = getImportSourceBadge(db);
              return (
                <div key={db.id} className="group relative text-left rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all min-h-[140px] flex flex-col">
                  <button
                    type="button"
                    onClick={() => openDatabase(db.id)}
                    className="flex-1 text-left"
                    aria-label={t("notes.databases.openBase").replace("{name}", db.name)}
                  >
                    <div className="flex items-start gap-2 pr-6">
                      <span className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{db.name}</span>
                      {badge && <span className={`text-[8px] px-1 py-0.5 rounded-full shrink-0 ${badge.className}`}>{t(badge.labelKey)}</span>}
                    </div>
                    <dl className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-slate-400">
                      <div className="flex justify-between gap-2">
                        <dt>{t("notes.databases.createdAt")}</dt>
                        <dd className="text-zinc-700 dark:text-slate-300">{formatDbDate(db.createdAt, locale)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("notes.databases.updatedAt")}</dt>
                        <dd className="text-zinc-700 dark:text-slate-300">{formatDbDate(db.updatedAt, locale)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>{t("notes.databases.columnCount")}</dt>
                        <dd className="text-zinc-700 dark:text-slate-300">{db.columns.length}</dd>
                      </div>
                    </dl>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteDbTarget(db)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700"
                    title={t("notes.databases.deleteDatabase")}
                    aria-label={t("notes.databases.deleteDatabase")}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {dialogs}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={backToList} className="rounded-md p-2 text-zinc-400 hover:text-zinc-600" aria-label={t("notes.databases.backToList")}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-xs text-zinc-400">{t("notes.databases.sectionPath")}</span>
      </div>

      {!selectedDb ? (
        <p className="text-sm text-zinc-500">{t("notes.databases.loading")}</p>
      ) : dbLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {editingDbName ? (
              <input
                type="text"
                value={dbNameDraft}
                onChange={(e) => setDbNameDraft(e.target.value)}
                onBlur={() => void commitRenameDatabase()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRenameDatabase();
                  if (e.key === "Escape") setEditingDbName(false);
                }}
                autoFocus
                className={`${inputCls} text-2xl font-bold max-w-xl`}
                aria-label={t("notes.databases.renameDatabase")}
              />
            ) : (
              <button
                type="button"
                onClick={startRenameDatabase}
                disabled={!isOwner}
                className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-slate-100 hover:text-emerald-700 dark:hover:text-emerald-400 text-left disabled:hover:text-zinc-900 dark:disabled:hover:text-slate-100"
                title={t("notes.databases.renameDatabase")}
              >
                {selectedDb.name}
              </button>
            )}

            {presence.length > 0 && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                {t("notes.databases.onlinePeers").replace(
                  "{{names}}",
                  presence.map((p) => p.displayName).join(", "),
                )}
              </p>
            )}
            {!canWrite && (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("notes.databases.readOnlyBanner")}</p>
            )}

            {isOwner && (
              <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 max-w-xl space-y-3">
                <p className="text-sm font-medium text-zinc-800 dark:text-slate-200">{t("notes.databases.shareTitle")}</p>
                {selectedDb.sharedWithEmail ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-zinc-700 dark:text-slate-200 truncate max-w-[14rem]">
                      {selectedDb.sharedWithEmail}
                    </span>
                    <select
                      className={`${inputCls} max-w-[10rem] text-xs`}
                      value={selectedDb.collaboratorWrite ? "rw" : "ro"}
                      aria-label={t("notes.databases.shareAccess")}
                      onChange={(e) => {
                        const rw = e.target.value === "rw";
                        setShareCanWrite(rw);
                        void updateUserDatabase(selectedDb.id, { collaboratorWrite: rw })
                          .then((updated) => {
                            setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
                          })
                          .catch((err) => toast.error(formatUserFacingError(err, "toast.genericError")));
                      }}
                    >
                      <option value="ro">{t("notes.databases.shareAccessRo")}</option>
                      <option value="rw">{t("notes.databases.shareAccessRw")}</option>
                    </select>
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={() => {
                        setShareEmail("");
                        setShareCanWrite(false);
                        void updateUserDatabase(selectedDb.id, { sharedWithEmail: null })
                          .then((updated) => {
                            setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
                          })
                          .catch((err) => toast.error(formatUserFacingError(err, "toast.genericError")));
                      }}
                    >
                      {t("notes.databases.shareClear")}
                    </button>
                  </div>
                ) : !selectedDb.shared ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder={t("notes.databases.shareEmailPlaceholder")}
                      className={`${inputCls} max-w-xs`}
                    />
                    <select
                      className={`${inputCls} max-w-[10rem] text-xs`}
                      value={shareCanWrite ? "rw" : "ro"}
                      aria-label={t("notes.databases.shareAccess")}
                      onChange={(e) => setShareCanWrite(e.target.value === "rw")}
                    >
                      <option value="ro">{t("notes.databases.shareAccessRo")}</option>
                      <option value="rw">{t("notes.databases.shareAccessRw")}</option>
                    </select>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      disabled={!shareEmail.trim()}
                      onClick={() => {
                        void updateUserDatabase(selectedDb.id, {
                          sharedWithEmail: shareEmail.trim(),
                          collaboratorWrite: shareCanWrite,
                          shared: false,
                          teamId: null,
                        })
                          .then((updated) => {
                            setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
                            toast.success(t("notes.databases.shareSaved"));
                          })
                          .catch((err) => toast.error(formatUserFacingError(err, "toast.genericError")));
                      }}
                    >
                      {t("notes.databases.shareSave")}
                    </button>
                  </div>
                ) : null}

                <div className="border-t border-zinc-100 dark:border-slate-800 pt-3 space-y-2">
                  <p className="text-[11px] text-zinc-500 dark:text-slate-400">
                    {t("notes.databases.shareWithTeam")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={`${inputCls} max-w-xs text-xs`}
                      value={selectedDb.shared ? (selectedDb.teamId ?? "") : ""}
                      onChange={(e) => {
                        const teamId = e.target.value || null;
                        void updateUserDatabase(selectedDb.id, {
                          shared: !!teamId,
                          teamId,
                          sharedWithEmail: teamId ? null : selectedDb.sharedWithEmail ?? null,
                          collaboratorWrite: false,
                        })
                          .then((updated) => {
                            setDatabases((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
                            if (teamId) {
                              setShareEmail("");
                              setShareCanWrite(false);
                            }
                          })
                          .catch((err) => toast.error(formatUserFacingError(err, "toast.genericError")));
                      }}
                    >
                      <option value="">{t("notes.databases.shareTeamNone")}</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                    {selectedDb.shared && (
                      <span className="text-[11px] text-zinc-500 dark:text-slate-400">
                        {t("notes.databases.shareAccessRo")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-xs px-2 py-1 rounded-md border border-zinc-300 dark:border-slate-600"
                onClick={() => {
                  setShowHistory((v) => !v);
                  if (!showHistory) void loadRevisions();
                }}
              >
                {t("notes.databases.history")}
              </button>
            </div>
            {showHistory && (
              <ul className="text-xs space-y-1 rounded-md border border-zinc-200 dark:border-slate-700 p-2 max-w-xl">
                {revisions.length === 0 ? (
                  <li className="text-zinc-500">{t("notes.databases.historyEmpty")}</li>
                ) : (
                  revisions.map((rev) => (
                    <li key={rev.id} className="flex items-center justify-between gap-2">
                      <span>
                        {new Date(rev.at).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")}
                        {rev.byEmail ? ` · ${rev.byEmail}` : ""}
                      </span>
                      {canWrite && (
                        <button
                          type="button"
                          className="text-emerald-700 dark:text-emerald-400"
                          onClick={() => {
                            void restoreDatabaseRevision(selectedDb.id, rev.id)
                              .then((res) => {
                                setRows(res.rows);
                                setDatabases((prev) =>
                                  prev.map((d) => (d.id === res.database.id ? res.database : d)),
                                );
                                toast.success(t("notes.databases.historyRestored"));
                                void loadRevisions();
                              })
                              .catch((err) => toast.error(formatUserFacingError(err, "toast.genericError")));
                          }}
                        >
                          {t("notes.databases.historyRestore")}
                        </button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="inline-flex w-fit rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/60 p-0.5"
                role="tablist"
                aria-label={t("notes.databases.viewTable")}
              >
                {([
                  ["table", t("notes.databases.viewTable"), () => setViewMode("table")],
                  ["board", t("notes.databases.viewBoard"), () => void handleSetBoardView()],
                  ["calendar", t("notes.databases.viewCalendar"), () => setViewMode("calendar")],
                ] as const).map(([mode, label, onClick]) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === mode}
                    onClick={onClick}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === mode
                        ? "bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-sm"
                        : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {((isOwner && databases.length > 1) || (canWrite && viewMode !== "table")) && (
                <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
                  {isOwner && databases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void handleAddRelationColumn()}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+</span>
                      {t("notes.databases.relationColumn")}
                    </button>
                  )}
                  {canWrite && viewMode !== "table" && (
                  <button
                    type="button"
                    onClick={() => void handleAddRow()}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+</span>
                    {t("notes.databases.newRow")}
                  </button>
                  )}
                </div>
                )}
                <Link
                  href="/migrate/notion?mode=data"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {t("notes.databases.importNotion")}
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-x-auto">
            {viewMode === "board" && boardGroups.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto p-4 pb-2">
                {boardGroups.map((g) => (
                  <div key={g.label} className="min-w-[180px] shrink-0 rounded-md bg-zinc-50 dark:bg-slate-800/50 p-2">
                    <p className="text-xs font-semibold mb-2">{g.label}</p>
                    {g.rows.map((row) => (
                      <div key={row.id} className="rounded border bg-white dark:bg-slate-900 p-2 text-xs mb-2">
                        {selectedDb.columns[0] ? String(row.values[selectedDb.columns[0].id] ?? "—") : "—"}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : viewMode === "calendar" ? (
              <div className="p-4">
                {calendarGroups.length > 0 ? (
                  <div className="space-y-3">
                    {calendarGroups.map((g) => (
                      <div key={g.date} className="rounded-md border border-zinc-200 dark:border-slate-700 p-3">
                        <p className="text-xs font-semibold text-zinc-700 dark:text-slate-300 mb-2">{g.date}</p>
                        <ul className="space-y-1 text-xs">
                          {g.rows.map((row) => (
                            <li key={row.id} className="rounded bg-zinc-50 dark:bg-slate-800/50 px-2 py-1">
                              {selectedDb.columns[0] ? String(row.values[selectedDb.columns[0].id] ?? "—") : "—"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">{t("notes.databases.calendarNoDate")}</p>
                )}
              </div>
            ) : (
              <DndContext
                sensors={columnSensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void handleColumnDragEnd(e)}
              >
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-slate-700">
                      <SortableContext
                        items={selectedDb.columns.map((c) => c.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {selectedDb.columns.map((col) => (
                          <SortableColumnHeader
                            key={col.id}
                            col={col}
                            canDelete={isOwner && selectedDb.columns.length > 1}
                            editing={isOwner && editingColumnId === col.id}
                            editingName={editingColumnName}
                            inputCls={inputCls}
                            onStartRename={() => {
                              if (isOwner) startRenameColumn(col);
                            }}
                            onEditingNameChange={setEditingColumnName}
                            onCommitRename={() => void commitRenameColumn()}
                            onCancelRename={() => {
                              setEditingColumnId(null);
                              setEditingColumnName("");
                            }}
                            onDelete={() => setDeleteColumnTarget(col)}
                            renameLabel={t("notes.databases.renameColumn")}
                            renameHint={t("notes.databases.renameColumnHint")}
                            deleteLabel={t("notes.databases.deleteColumn")}
                            dragLabel={t("notes.databases.dragColumn")}
                          />
                        ))}
                      </SortableContext>
                      {isOwner ? (
                        <th className="w-10 px-1 py-2.5 bg-zinc-50/80 dark:bg-slate-800/40">
                          <button
                            type="button"
                            onClick={handleAddColumn}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-lg font-semibold leading-none"
                            aria-label={t("notes.databases.addColumn")}
                            title={t("notes.databases.addColumn")}
                          >
                            +
                          </button>
                        </th>
                      ) : (
                        <th className="w-8" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr
                        key={row.id}
                        data-db-row-id={row.id}
                        className="group border-b border-zinc-100 dark:border-slate-800"
                      >
                        {selectedDb.columns.map((col) => {
                          const peer = peerByCell.get(`${row.id}:${col.id}`);
                          return (
                          <td
                            key={col.id}
                            className={`px-3 py-1.5 align-top relative ${peer ? "ring-2 ring-pink-400/70 rounded-sm bg-pink-50/40 dark:bg-pink-950/20" : ""}`}
                            onFocusCapture={() => setCellCursor({ rowId: row.id, columnId: col.id })}
                          >
                            {peer && (
                              <span className="absolute -top-2 left-1 z-10 text-[9px] font-medium px-1 rounded bg-pink-500 text-white truncate max-w-[6rem]">
                                {peer.displayName.split("@")[0] || peer.displayName}
                              </span>
                            )}
                            <CellEditor
                              column={col}
                              value={row.values[col.id] ?? null}
                              onChange={(v) => void handleCellChange(row, col.id, v)}
                              inputCls={inputCls}
                              databases={databases}
                              loadRelationRows={loadRelationRows}
                              relationRowsCache={relationRowsCache}
                              readOnly={!canWrite}
                            />
                          </td>
                          );
                        })}
                        <td className="px-2 w-10">
                          {canWrite && (
                          <button
                            type="button"
                            className="text-xs text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            aria-label={t("notes.databases.deleteRow")}
                            onClick={() =>
                              void deleteDatabaseRow(selectedDb.id, row.id).then(() =>
                                setRows((p) => p.filter((r) => r.id !== row.id)),
                              )
                            }
                          >
                            ×
                          </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {canWrite && (
                      <tr className="border-b border-transparent">
                        <td
                          colSpan={Math.max(selectedDb.columns.length, 1) + 1}
                          className="px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => void handleAddRow()}
                            className="text-xs text-zinc-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            {t("notes.databases.newRow")}
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </DndContext>
            )}
          </div>
        </>
      )}

      {dialogs}
    </div>
  );
}

function SortableColumnHeader({
  col,
  canDelete,
  editing,
  editingName,
  inputCls,
  onStartRename,
  onEditingNameChange,
  onCommitRename,
  onCancelRename,
  onDelete,
  renameLabel,
  renameHint,
  deleteLabel,
  dragLabel,
}: {
  col: DatabaseColumnDef;
  canDelete: boolean;
  editing: boolean;
  editingName: string;
  inputCls: string;
  onStartRename: () => void;
  onEditingNameChange: (name: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  renameLabel: string;
  renameHint: string;
  deleteLabel: string;
  dragLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
    ),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="text-left px-2 py-2.5 text-xs text-zinc-600 dark:text-slate-400 min-w-[120px] whitespace-nowrap bg-zinc-50/80 dark:bg-slate-800/40"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-0.5 text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400"
          aria-label={dragLabel}
          title={dragLabel}
          {...attributes}
          {...listeners}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </svg>
        </button>
        {editing ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              if (e.key === "Escape") onCancelRename();
            }}
            autoFocus
            className={`${inputCls} text-xs font-medium flex-1`}
            aria-label={renameLabel}
          />
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            className="text-left flex-1 font-medium text-zinc-700 dark:text-slate-300 hover:text-zinc-900 dark:hover:text-slate-100 cursor-text truncate"
            title={renameHint}
          >
            {col.name}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-red-400 hover:text-red-600 text-xs shrink-0"
            title={deleteLabel}
            aria-label={deleteLabel}
          >
            ×
          </button>
        )}
      </div>
    </th>
  );
}

function CellEditor({
  column,
  value,
  onChange,
  inputCls,
  databases,
  loadRelationRows,
  relationRowsCache,
  readOnly = false,
}: {
  column: DatabaseColumnDef;
  value: string | number | boolean | null;
  onChange: (v: string | number | boolean | null) => void;
  inputCls: string;
  databases: UserDatabase[];
  loadRelationRows: (databaseId: string) => Promise<DatabaseRow[]>;
  relationRowsCache: Record<string, DatabaseRow[]>;
  readOnly?: boolean;
}) {
  const [relationOptions, setRelationOptions] = useState<DatabaseRow[]>([]);

  useEffect(() => {
    if (column.type !== "relation" || !column.relationDatabaseId) return;
    const cached = relationRowsCache[column.relationDatabaseId];
    if (cached) {
      setRelationOptions(cached);
      return;
    }
    void loadRelationRows(column.relationDatabaseId).then(setRelationOptions);
  }, [column.type, column.relationDatabaseId, loadRelationRows, relationRowsCache]);

  if (column.type === "relation" && column.relationDatabaseId) {
    const relatedDb = databases.find((d) => d.id === column.relationDatabaseId);
    const labelFor = (rowId: string) => {
      const row = relationOptions.find((r) => r.id === rowId);
      if (!row || !relatedDb) return rowId;
      const titleCol = relatedDb.columns[0];
      return titleCol ? String(row.values[titleCol.id] ?? rowId) : rowId;
    };
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
        disabled={readOnly}
      >
        <option value="">—</option>
        {relationOptions.map((r) => (
          <option key={r.id} value={r.id}>{labelFor(r.id)}</option>
        ))}
      </select>
    );
  }
  if (column.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readOnly}
      />
    );
  }
  if (column.type === "select" && column.options?.length) {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={inputCls}
        disabled={readOnly}
      >
        <option value="">—</option>
        {column.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const inputType = column.type === "number" ? "number" : column.type === "date" ? "date" : column.type === "email" ? "email" : "text";
  return (
    <input
      type={inputType}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(column.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : (e.target.value || null))}
      className={inputCls}
      disabled={readOnly}
      readOnly={readOnly}
    />
  );
}
