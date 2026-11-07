"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import DatabasesSection from "@/app/notes/_components/DatabasesSection";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthContext";
import ExportImportDropdown from "@/components/ExportImportDropdown";
import NoteAttachmentsPanel from "@/components/NoteAttachmentsPanel";
import NoteToolbar from "@/components/NoteToolbar";
import NoteOcrDialog from "@/components/ocr/NoteOcrDialog";
import DiagramImportDialog from "@/components/notes/DiagramImportDialog";
import NoteDocument from "@/components/notes/NoteDocument";
import SpawnTasksDialog from "@/components/notes/SpawnTasksDialog";
import PageHelpButton from "@/components/PageHelpButton";
import { SoftLockHint, PlanBadge } from "@/components/SoftLock";
import { useToast } from "@/components/Toast";
import SlashCommandMenu, { type SlashTaskPayload } from "@/components/SlashCommandMenu";
import { useLocale } from "@/lib/LocaleContext";
import { clearNotesLocalStorage, useOfflineNotes } from "@/lib/useOfflineNotes";
import { createTodo, getProjects, getTodos, getTeams, purgeArchivedNoteApi, exportNotes, importNotesFile } from "@/lib/api";
import type { Note, Project, Todo, Team } from "@/lib/api";
import { personalNotesCreateBlocked } from "@/lib/freeQuota";
import { formatUserFacingError } from "@/lib/apiErrors";
import { getDiagramConfig, getOcrConfig, listSpawnedTasks, uploadNoteAttachment, type DiagramConfig, type OcrConfig } from "@/lib/api/notes";
import { parseNoteTaskLines } from "@/lib/noteTaskLines";
import { newClientEntityId } from "@/lib/newClientId";
import { appendCapture, resolveNoteBlocks, textHtmlFromBlocks } from "@/lib/noteBlocks";
import { ocrTextToHtml } from "@/lib/ocrText";
import { trackFunnelEvent } from "@/lib/productAnalytics";
import { useNoteLiveCollab } from "@/hooks/useNoteLiveCollab";
import ViewportOverlay, { sheetPanelClass } from "@/components/ui/ViewportOverlay";
import { useNarrowVisualViewport } from "@/hooks/useVisualViewportRect";

function NotesPageInner() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const currentUid = authUser?.uid ?? null;
  const searchParams = useSearchParams();
  const {
    notes,
    folders,
    loading,
    online,
    syncing,
    sharedSyncError,
    addNote,
    saveNote,
    removeNote,
    togglePin,
    createFolder,
    removeFolder,
    reload,
    pushToServer,
  } = useOfflineNotes();
  /** Sentinel activeFolder value for notes shared with the current user. */
  const SHARED_SCOPE = "__shared__";
  const [resyncing, setResyncing] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [collabEmailInput, setCollabEmailInput] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [focusedTextId, setFocusedTextId] = useState<string | null>(null);
  const [mobileShowEditor, setMobileShowEditor] = useState(false);

  type NotesHomeView = "tiles" | "list" | "databases";
  const [homeView, setHomeView] = useState<NotesHomeView>("tiles");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const createFolderNarrow = useNarrowVisualViewport(createFolderOpen);
  const [createFolderName, setCreateFolderName] = useState("");
  const [deleteFolderModal, setDeleteFolderModal] = useState<string | null>(null);
  const deleteFolderNarrow = useNarrowVisualViewport(!!deleteFolderModal);
  const [deleteFolderChoice, setDeleteFolderChoice] = useState<"a" | "b" | "c" | "d">("a");
  const [deleteFolderTarget, setDeleteFolderTarget] = useState("");
  const [folderPickInput, setFolderPickInput] = useState("");
  const [ocrConfig, setOcrConfig] = useState<OcrConfig | null>(null);
  const [diagramConfig, setDiagramConfig] = useState<DiagramConfig | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [spawnedTasks, setSpawnedTasks] = useState<Todo[]>([]);
  const [ocrAttachment, setOcrAttachment] = useState<{ id: string; name: string } | null>(null);
  const [attachmentsRefreshKey, setAttachmentsRefreshKey] = useState(0);
  const [metaOpen, setMetaOpen] = useState(false);
  const ocrRangeRef = useRef<Range | null>(null);

  const isOwnNote = useCallback(
    (n: Note) => (!currentUid ? true : !n.userId || n.userId === currentUid),
    [currentUid],
  );

  useEffect(() => {
    const section = searchParams.get("section");
    const db = searchParams.get("db");
    if (section === "databases") {
      setHomeView("databases");
    }
    if (searchParams.get("shared") === "1" || section === "shared") {
      setActiveFolder(SHARED_SCOPE);
      setHomeView("list");
    }
  }, [searchParams]);

  useEffect(() => {
    if (sharedSyncError) {
      toast.error(t("notes.sharedFetchError"));
    }
  }, [sharedSyncError, toast, t]);

  useEffect(() => {
    getProjects().then((p) => setProjects(p.filter((x) => x.status === "active"))).catch(() => {});
    getTodos().then((t) => setTodos(t.filter((x) => x.status === "active"))).catch(() => {});
    getTeams().then(setTeams).catch(() => setTeams([]));
    getOcrConfig().then(setOcrConfig).catch(() => {});
    getDiagramConfig().then(setDiagramConfig).catch(() => setDiagramConfig({ enabled: false, dailyLimit: 0, remaining: 0 }));
  }, []);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const isForeignNote = !!(selected && currentUid && selected.userId && selected.userId !== currentUid);
  const [collabCanWrite, setCollabCanWrite] = useState(false);
  /** Foreign + read-only (hides owner chrome). Co-editors keep edit UI. */
  const isSharedNote = isForeignNote && !collabCanWrite;

  const { presence: notePresence, canWrite: liveCanWrite } = useNoteLiveCollab({
    noteId: selectedId,
    displayName: authUser?.email ?? currentUid ?? "user",
    localUpdatedAt: selected?.updatedAt ?? null,
    isDirty: false,
    onRemoteNote: (remote, canWrite) => {
      setCollabCanWrite(canWrite);
      if (!selectedId) return;
      // Soft merge: update content if remote is newer (handled by hook gate)
      saveNote(remote.id, {
        title: remote.title,
        content: remote.content,
        blocks: remote.blocks?.length ? remote.blocks : null,
      });
    },
  });

  useEffect(() => {
    if (!isForeignNote) {
      setCollabCanWrite(false);
      return;
    }
    setCollabCanWrite(liveCanWrite);
  }, [isForeignNote, liveCanWrite, selectedId]);

  const stripHtml = (value: string): string =>
    value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const folderNames = useMemo(
    () => folders.map((f) => f.name).filter((name) => name !== t("notes.folderUntitled")),
    [folders, t],
  );

  const folderNoteCount = useCallback(
    (name: string) =>
      folders.find((f) => f.name === name)?.noteCount
      ?? notes.filter((n) => isOwnNote(n) && n.folder === name).length,
    [folders, notes, isOwnNote],
  );

  const sharedNotes = useMemo(
    () => notes.filter((n) => currentUid && n.userId && n.userId !== currentUid),
    [notes, currentUid],
  );

  const isProjectLinkedFolder = useCallback(
    (name: string) => Boolean(folders.find((f) => f.name === name)?.projectId),
    [folders],
  );

  const promptDeleteFolder = useCallback((folderName: string) => {
    if (isProjectLinkedFolder(folderName)) {
      toast.error(t("notes.deleteFolderProjectBlocked"));
      return;
    }
    setDeleteFolderModal(folderName);
    setDeleteFolderChoice("a");
    setDeleteFolderTarget("");
  }, [isProjectLinkedFolder, toast, t]);

  const listScoped = useMemo(() => {
    if (homeView !== "list") return [];
    if (activeFolder === SHARED_SCOPE) {
      return sharedNotes;
    }
    return notes.filter((n) => {
      if (!isOwnNote(n)) return false;
      return activeFolder === null ? !n.folder?.trim() : n.folder === activeFolder;
    });
  }, [notes, homeView, activeFolder, sharedNotes, isOwnNote]);

  const filtered = useMemo(() => {
    if (!search.trim()) return listScoped;
    const q = search.toLowerCase();
    return listScoped.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        stripHtml(n.content).toLowerCase().includes(q) ||
        (n.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [listScoped, search]);

  const handleNew = useCallback(() => {
    if (personalNotesCreateBlocked(authUser)) {
      toast.error(t("quota.free.noteLimitHint"));
      return;
    }
    if (activeFolder === SHARED_SCOPE) {
      setActiveFolder(null);
    }
    const opts =
      homeView === "list" && activeFolder && activeFolder !== SHARED_SCOPE
        ? { folder: activeFolder }
        : undefined;
    const id = addNote(undefined, opts);
    setHomeView("list");
    setSelectedId(id);
    setTagInput("");
    setCollabEmailInput("");
    setMobileShowEditor(true);
    trackFunnelEvent("note_created", { source: "notes_hub" });
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [addNote, homeView, activeFolder, authUser, toast, t]);

  const notesQuotaBlocked = personalNotesCreateBlocked(authUser);

  const handleNotesImport = useCallback(
    async (file: File) => {
      const result = await importNotesFile(file);
      trackFunnelEvent("data_imported", { source: "notes" });
      await reload();
      return result;
    },
    [reload],
  );

  const handleNotesExport = useCallback(
    async (format: "csv" | "json" | "md") => {
      await exportNotes(format);
      trackFunnelEvent("data_exported", { source: "notes" });
    },
    [],
  );

  const handleOpenFolderTile = useCallback((folder: string | null) => {
    setActiveFolder(folder);
    setHomeView("list");
    setSelectedId(null);
    setSearch("");
    setMobileShowEditor(false);
  }, []);

  const handleBackToTiles = useCallback(() => {
    setHomeView("tiles");
    setActiveFolder(null);
    setSelectedId(null);
    setMobileShowEditor(false);
    setDeleteConfirm(null);
  }, []);

  const handleCreateFolderSubmit = useCallback(async () => {
    const name = createFolderName.trim();
    if (!name) return;
    if (folderNames.includes(name)) {
      setCreateFolderOpen(false);
      setCreateFolderName("");
      handleOpenFolderTile(name);
      return;
    }
    try {
      await createFolder(name);
      setCreateFolderOpen(false);
      setCreateFolderName("");
      handleOpenFolderTile(name);
      toast.success(t("notes.folderCreated"));
    } catch {
      toast.error(t("notes.folderExists"));
    }
  }, [createFolderName, folderNames, createFolder, handleOpenFolderTile, toast, t]);

  const executeDeleteFolder = useCallback(async () => {
    const folderName = deleteFolderModal;
    if (!folderName) return;
    if (isProjectLinkedFolder(folderName)) {
      toast.error(t("notes.deleteFolderProjectBlocked"));
      setDeleteFolderModal(null);
      return;
    }
    const targets = notes.filter((n) => n.folder === folderName && isOwnNote(n));
    try {
      if (targets.length === 0) {
        await removeFolder(folderName);
        setDeleteFolderModal(null);
        setDeleteFolderChoice("a");
        setDeleteFolderTarget("");
        toast.success(t("notes.saved"));
        if (activeFolder === folderName) handleBackToTiles();
        return;
      }
      if (deleteFolderChoice === "a") {
        for (const n of targets) saveNote(n.id, { folder: "" });
      } else if (deleteFolderChoice === "b") {
        const dest = deleteFolderTarget.trim();
        if (!dest || dest === folderName) {
          toast.error(t("notes.deleteFolderNeedTarget"));
          return;
        }
        for (const n of targets) saveNote(n.id, { folder: dest });
      } else if (deleteFolderChoice === "c") {
        for (const n of targets) await removeNote(n.id);
      } else {
        const ids = targets.map((x) => x.id);
        for (const id of ids) await removeNote(id);
        for (const id of ids) await purgeArchivedNoteApi(id);
      }
      setDeleteFolderModal(null);
      setDeleteFolderChoice("a");
      setDeleteFolderTarget("");
      try {
        await removeFolder(folderName);
      } catch {
        /* persisted entry may already be gone for legacy-only folders */
      }
      toast.success(t("notes.saved"));
      if (activeFolder === folderName) handleBackToTiles();
    } catch {
      toast.error(t("toast.genericError"));
    }
  }, [
    deleteFolderModal,
    deleteFolderChoice,
    deleteFolderTarget,
    notes,
    isOwnNote,
    saveNote,
    removeNote,
    removeFolder,
    toast,
    t,
    activeFolder,
    handleBackToTiles,
    isProjectLinkedFolder,
  ]);

  const handleSelect = useCallback((note: Note) => {
    setSelectedId(note.id);
    setDeleteConfirm(null);
    setTagInput("");
    setCollabEmailInput("");
    setMobileShowEditor(true);
  }, []);

  const noteNav = useMemo(() => {
    const idx = filtered.findIndex((n) => n.id === selectedId);
    return {
      index: idx,
      prev: idx > 0 ? filtered[idx - 1]! : null,
      next: idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1]! : null,
    };
  }, [filtered, selectedId]);

  const handleTitleChange = useCallback((value: string) => {
    if (!selectedId) return;
    saveNote(selectedId, { title: value });
  }, [selectedId, saveNote]);

  const handleContentChange = useCallback((value: string) => {
    if (!selectedId || !selected) return;
    const blocks = resolveNoteBlocks(selected);
    const textId = focusedTextId ?? blocks.find((block) => block.type === "text")?.id;
    if (!textId) return;
    const next = blocks.map((block) => (
      block.type === "text" && block.id === textId ? { ...block, html: value } : block
    ));
    saveNote(selectedId, { blocks: next, content: textHtmlFromBlocks(next) });
  }, [selectedId, selected, focusedTextId, saveNote]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    await removeNote(deleteConfirm);
    if (selectedId === deleteConfirm) {
      setSelectedId(notes.find((n) => n.id !== deleteConfirm)?.id ?? null);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, removeNote, selectedId, notes]);

  const handleResyncFromServer = useCallback(async () => {
    if (!window.confirm(t("notes.resyncConfirm"))) return;
    setResyncing(true);
    try {
      clearNotesLocalStorage();
      await reload();
      toast.success(t("notes.resyncSuccess"));
    } catch {
      toast.error(t("notes.resyncError"));
    } finally {
      setResyncing(false);
    }
  }, [reload, t, toast]);

  const handlePushToServer = useCallback(async () => {
    if (!online) {
      toast.error(t("notes.pushOffline"));
      return;
    }
    if (!window.confirm(t("notes.pushConfirm"))) return;
    setPushing(true);
    try {
      await pushToServer();
      toast.success(t("notes.pushSuccess"));
    } catch (e) {
      const msg = e instanceof Error && e.message === "offline" ? t("notes.pushOffline") : t("notes.pushError");
      toast.error(msg);
    } finally {
      setPushing(false);
    }
  }, [online, pushToServer, t, toast]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const idParam = searchParams.get("id") ?? searchParams.get("note");
      if (idParam && notes.some((n) => n.id === idParam)) {
        const found = notes.find((x) => x.id === idParam);
        setSelectedId(idParam);
        setHomeView("list");
        setActiveFolder(found?.folder?.trim() ? found.folder! : null);
        setMobileShowEditor(true);
      }
    });
  }, [notes, searchParams]);

  useEffect(() => {
    if (homeView !== "list" || loading) return;
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((n) => n.id === selectedId)) {
      setSelectedId(filtered[0]!.id);
    }
  }, [homeView, loading, filtered, selectedId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        handleNew();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleNew]);

  useEffect(() => {
    const nav = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowUp" && noteNav.prev) {
        e.preventDefault();
        handleSelect(noteNav.prev);
      }
      if (e.key === "ArrowDown" && noteNav.next) {
        e.preventDefault();
        handleSelect(noteNav.next);
      }
    };
    document.addEventListener("keydown", nav);
    return () => document.removeEventListener("keydown", nav);
  }, [noteNav, handleSelect]);

  const handleAddTag = useCallback((tag: string) => {
    if (!selectedId || !tag.trim()) return;
    const current = selected?.tags ?? [];
    if (current.length >= 10 || current.includes(tag.trim())) return;
    saveNote(selectedId, { tags: [...current, tag.trim()] });
    setTagInput("");
  }, [selectedId, selected, saveNote]);

  const handleRemoveTag = useCallback((tag: string) => {
    if (!selectedId) return;
    const current = selected?.tags ?? [];
    saveNote(selectedId, { tags: current.filter((t) => t !== tag) });
  }, [selectedId, selected, saveNote]);

  const commitBlocks = useCallback((blocks: ReturnType<typeof resolveNoteBlocks>) => {
    if (!selectedId) return;
    saveNote(selectedId, { blocks, content: textHtmlFromBlocks(blocks) });
  }, [selectedId, saveNote]);

  const openOcr = useCallback((attachment: { id: string; name: string } | null = null) => {
    const editor = contentRef.current;
    const sel = window.getSelection();
    ocrRangeRef.current =
      editor && sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)
        ? sel.getRangeAt(0).cloneRange()
        : null;
    setOcrAttachment(attachment);
    setOcrOpen(true);
  }, []);

  const closeOcr = useCallback(() => {
    setOcrOpen(false);
    setOcrAttachment(null);
    getOcrConfig().then(setOcrConfig).catch(() => {});
  }, []);

  const handleOcrInsert = useCallback((text: string) => {
    const editor = contentRef.current;
    if (!editor || isSharedNote) return;
    const html = ocrTextToHtml(text);
    if (!html) return;
    editor.focus();
    const sel = window.getSelection();
    const range = ocrRangeRef.current;
    if (sel) {
      sel.removeAllRanges();
      if (range && editor.contains(range.commonAncestorContainer)) {
        sel.addRange(range);
      } else {
        const end = document.createRange();
        end.selectNodeContents(editor);
        end.collapse(false);
        sel.addRange(end);
      }
    }
    if (!document.execCommand("insertHTML", false, html)) {
      editor.insertAdjacentHTML("beforeend", html);
    }
    ocrRangeRef.current = null;
    handleContentChange(editor.innerHTML);
    toast.success(t("notes.ocr.inserted"));
  }, [isSharedNote, handleContentChange, toast, t]);

  const handleOcrAttachImage = useCallback(async (file: File) => {
    if (!selectedId) return;
    try {
      await uploadNoteAttachment(selectedId, file);
      setAttachmentsRefreshKey((k) => k + 1);
    } catch {
      toast.error(t("notes.ocr.attachFailed"));
    }
  }, [selectedId, toast, t]);

  const refreshSpawned = useCallback((noteId: string) => {
    listSpawnedTasks(noteId).then(setSpawnedTasks).catch(() => setSpawnedTasks([]));
  }, []);

  useEffect(() => {
    if (!selectedId || isSharedNote) {
      setSpawnedTasks([]);
      return;
    }
    refreshSpawned(selectedId);
  }, [selectedId, isSharedNote, refreshSpawned]);

  const handleSlashCreateTask = useCallback(
    async (payload: SlashTaskPayload) => {
      const isDocument = Boolean(selected?.projectId || stripHtml(selected?.content ?? "").trim());
      if (selectedId && isDocument) {
        const { spawnTasksFromNote } = await import("@/lib/api/notes");
        await spawnTasksFromNote(selectedId, {
          projectId: payload.projectId ?? selected?.projectId ?? null,
          items: [{
            clientKey: `slash-${newClientEntityId()}`,
            title: payload.title,
            priority: payload.priority,
            deadline: payload.deadline ?? null,
            assignedTo: payload.assignedTo ?? null,
          }],
        });
        refreshSpawned(selectedId);
      } else {
        const todo = await createTodo({
          id: newClientEntityId(),
          title: payload.title,
          priority: payload.priority,
          effort: "medium",
          deadline: payload.deadline ? `${payload.deadline}T12:00:00` : null,
          projectId: payload.projectId ?? null,
          assignedTo: payload.assignedTo ?? null,
        });
        if (selectedId) saveNote(selectedId, { todoId: todo.id });
      }
      getTodos().then((rows) => setTodos(rows.filter((x) => x.status === "active"))).catch(() => {});
    },
    [selectedId, selected, saveNote, refreshSpawned],
  );

  useEffect(() => {
    setFolderPickInput("");
    setOcrOpen(false);
    setOcrAttachment(null);
    setMetaOpen(false);
    setFocusedTextId(null);
  }, [selected?.id]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  const unfolderedCount = useMemo(
    () => notes.filter((n) => isOwnNote(n) && !n.folder?.trim()).length,
    [notes, isOwnNote],
  );

  const latestUpdatedInFolder = useCallback(
    (folder: string | null): string | null => {
      const subset =
        folder === null
          ? notes.filter((n) => isOwnNote(n) && !n.folder?.trim())
          : notes.filter((n) => isOwnNote(n) && n.folder === folder);
      if (subset.length === 0) return null;
      return subset.reduce((best, n) =>
        new Date(n.updatedAt) > new Date(best.updatedAt) ? n : best,
      ).updatedAt;
    },
    [notes, isOwnNote],
  );

  return (
    <AppShell>
      {homeView === "databases" ? (
        <div className="min-h-[calc(100vh-65px)] overflow-y-auto bg-gradient-to-b from-emerald-50/50 via-zinc-50 to-zinc-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
          <DatabasesSection
            initialDatabaseId={searchParams.get("db")}
            onBack={() => setHomeView("tiles")}
          />
        </div>
      ) : homeView === "tiles" ? (
        <div className="min-h-[calc(100vh-65px)] overflow-y-auto bg-gradient-to-b from-emerald-50/50 via-zinc-50 to-zinc-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
          <div className="max-w-5xl mx-auto p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-slate-100">{t("notes.title")}</h1>
                <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1.5">{t("notes.homeTiles")}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <PageHelpButton helpId="notes.hub" iconOnly />
                <ExportImportDropdown
                  exportCsv={() => handleNotesExport("csv")}
                  exportJson={() => handleNotesExport("json")}
                  exportMarkdown={() => handleNotesExport("md")}
                  onImport={handleNotesImport}
                />
                <Link
                  href="/settings?tab=admin"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-[11px] font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
                  title={t("notes.linkAccountData")}
                >
                  {t("notes.linkAccountData")}
                </Link>
                <Link
                  href="/archive/data"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
                  title={t("archives.data.hubTitle")}
                  aria-label={t("archives.data.hubTitle")}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleResyncFromServer()}
                  disabled={resyncing || pushing || loading}
                  className="rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  title={t("notes.resyncFromServer")}
                  aria-label={t("notes.resyncFromServer")}
                >
                  {resyncing ? (
                    <span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" aria-hidden />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePushToServer()}
                  disabled={!online || resyncing || pushing || loading}
                  className="rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  title={t("notes.pushToServer")}
                  aria-label={t("notes.pushToServer")}
                >
                  {pushing ? (
                    <span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" aria-hidden />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleNew}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white p-1.5 transition-colors shadow-sm shadow-emerald-500/25"
                  title={t("notes.new")}
                  aria-label={t("notes.new")}
                  data-testid="notes-new-tiles"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {notesQuotaBlocked && (
              <div className="mb-4 space-y-1 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
                <PlanBadge tier="freeQuota" />
                <SoftLockHint tier="freeQuota" hintKey="quota.free.noteLimitHint" />
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setHomeView("databases")}
                  className="text-left rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/25 p-4 shadow-sm hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-md transition-colors min-h-[120px] flex flex-col"
                >
                  <span className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("notes.databases.tile")}</span>
                  <span className="text-sm text-zinc-500 dark:text-slate-400 mt-2">{t("notes.databases.tileHint")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenFolderTile(null)}
                  className="text-left rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all min-h-[120px] flex flex-col"
                >
                  <span className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("notes.folderUntitled")}</span>
                  <span className="text-sm text-zinc-500 dark:text-slate-400 mt-2">
                    {t("notes.folderCount").replace("{{count}}", String(unfolderedCount))}
                  </span>
                  {latestUpdatedInFolder(null) && (
                    <span className="text-[11px] text-zinc-400 dark:text-slate-500 mt-auto pt-3">
                      {formatDate(latestUpdatedInFolder(null)!)}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenFolderTile(SHARED_SCOPE)}
                  className="text-left rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-950/20 p-4 shadow-sm hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all min-h-[120px] flex flex-col"
                  data-testid="notes-shared-tile"
                >
                  <span className="text-lg font-semibold text-zinc-900 dark:text-slate-100">{t("notes.sharedFolderTile")}</span>
                  <span className="text-sm text-zinc-500 dark:text-slate-400 mt-2">{t("notes.sharedFolderHint")}</span>
                  <span className="text-sm text-zinc-500 dark:text-slate-400 mt-2">
                    {t("notes.folderCount").replace("{{count}}", String(sharedNotes.length))}
                  </span>
                  {sharedNotes[0]?.updatedAt && (
                    <span className="text-[11px] text-zinc-400 dark:text-slate-500 mt-auto pt-3">
                      {formatDate(sharedNotes[0].updatedAt)}
                    </span>
                  )}
                </button>
                {folderNames.map((fn) => (
                  <div
                    key={fn}
                    className="group relative text-left rounded-xl border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all min-h-[120px] flex flex-col"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenFolderTile(fn)}
                      className="flex-1 text-left p-4 flex flex-col"
                      aria-label={t("notes.openFolder").replace("{name}", fn)}
                    >
                      <div className="flex items-start gap-2 pr-6">
                        <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-lg font-semibold text-zinc-900 dark:text-slate-100 truncate block">{fn}</span>
                        </div>
                      </div>
                      <span className="text-sm text-zinc-500 dark:text-slate-400 mt-2 ml-7">
                        {t("notes.folderCount").replace(
                          "{{count}}",
                          String(folderNoteCount(fn)),
                        )}
                      </span>
                      {latestUpdatedInFolder(fn) && (
                        <span className="text-[11px] text-zinc-400 dark:text-slate-500 mt-auto pt-3 ml-7">
                          {formatDate(latestUpdatedInFolder(fn)!)}
                        </span>
                      )}
                    </button>
                    {!isProjectLinkedFolder(fn) && (
                      <button
                        type="button"
                        onClick={() => promptDeleteFolder(fn)}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700"
                        title={t("notes.deleteFolder")}
                        aria-label={t("notes.deleteFolder")}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => { setCreateFolderOpen(true); setCreateFolderName(""); }}
                  className="rounded-xl border-2 border-dashed border-zinc-300 dark:border-slate-600 bg-zinc-50/50 dark:bg-slate-800/40 p-4 min-h-[120px] flex flex-col items-center justify-center text-zinc-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors"
                >
                  <span className="text-sm font-medium">+ {t("notes.newFolder")}</span>
                </button>
              </div>
            )}
          </div>

          {createFolderOpen && (
            <ViewportOverlay
              open
              onClose={() => { setCreateFolderOpen(false); setCreateFolderName(""); }}
              zClassName="z-[100]"
              backdropClassName="absolute inset-0 bg-black/50"
            >
              <div
                role="dialog"
                aria-labelledby="new-folder-title"
                className={sheetPanelClass(
                  createFolderNarrow,
                  "relative w-full max-w-sm rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="new-folder-title" className="text-base font-semibold text-zinc-900 dark:text-slate-100">
                  {t("notes.newFolder")}
                </h2>
                <input
                  type="text"
                  value={createFolderName}
                  onChange={(e) => setCreateFolderName(e.target.value)}
                  placeholder={t("notes.newFolderPlaceholder")}
                  className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolderSubmit();
                  }}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setCreateFolderOpen(false); setCreateFolderName(""); }}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                  >
                    {t("notes.deleteFolderCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateFolderSubmit()}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-sm font-medium"
                  >
                    {t("notes.newFolderCreate")}
                  </button>
                </div>
              </div>
            </ViewportOverlay>
          )}
        </div>
      ) : (
      <div className="flex h-[calc(100vh-65px)] overflow-hidden">
        {/* Sidebar - Note list */}
        <div className={`w-full md:w-80 shrink-0 border-r border-zinc-200 dark:border-slate-700 flex flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ${mobileShowEditor ? "hidden md:flex" : "flex"}`}>
          {/* Header */}
          <div className="p-3 border-b border-zinc-200 dark:border-slate-700 space-y-2 min-w-0">
            <div className="flex items-start gap-2 min-w-0">
              <button
                type="button"
                onClick={handleBackToTiles}
                className="shrink-0 mt-0.5 p-1 rounded-md text-zinc-500 dark:text-slate-400 hover:bg-zinc-200 dark:hover:bg-slate-700 transition-colors"
                title={t("notes.backToFolders")}
                aria-label={t("notes.backToFolders")}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-bold text-zinc-900 dark:text-slate-100 truncate leading-tight">
                  {activeFolder === SHARED_SCOPE
                    ? t("notes.sharedFolderTile")
                    : (activeFolder ?? t("notes.folderUntitled"))}
                </h1>
                {activeFolder && activeFolder !== SHARED_SCOPE && !isProjectLinkedFolder(activeFolder) && (
                  <button
                    type="button"
                    onClick={() => promptDeleteFolder(activeFolder)}
                    className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    {t("notes.deleteFolder")}
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
                <PageHelpButton helpId="notes.editor" iconOnly />
                <ExportImportDropdown
                  exportCsv={() => handleNotesExport("csv")}
                  exportJson={() => handleNotesExport("json")}
                  exportMarkdown={() => handleNotesExport("md")}
                  onImport={handleNotesImport}
                />
                <Link
                  href="/archive/data"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors"
                  title={t("archives.data.hubTitle")}
                  aria-label={t("archives.data.hubTitle")}
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </Link>
                <button
                  type="button"
                  data-testid="notes-resync"
                  onClick={() => void handleResyncFromServer()}
                  disabled={resyncing || pushing || loading}
                  className="rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  title={t("notes.resyncFromServer")}
                  aria-label={t("notes.resyncFromServer")}
                >
                  {resyncing ? (
                    <span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" aria-hidden />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  data-testid="notes-push"
                  onClick={() => void handlePushToServer()}
                  disabled={!online || resyncing || pushing || loading}
                  className="rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1.5 text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  title={t("notes.pushToServer")}
                  aria-label={t("notes.pushToServer")}
                >
                  {pushing ? (
                    <span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" aria-hidden />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  )}
                </button>
                {activeFolder !== SHARED_SCOPE && (
                <button
                  type="button"
                  onClick={handleNew}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white shadow-sm shadow-emerald-500/25 p-1.5 transition-colors"
                  title={t("notes.new")}
                  aria-label={t("notes.new")}
                  data-testid="notes-new"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                )}
            </div>
            <input
              type="text"
              placeholder={t("notes.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-slate-100 placeholder-zinc-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-3">
                <p className="text-sm text-zinc-400 dark:text-slate-500">
                  {activeFolder === SHARED_SCOPE ? t("notes.sharedInboxEmpty") : t("notes.empty")}
                </p>
                <p className="text-xs text-zinc-400 dark:text-slate-500">
                  {activeFolder === SHARED_SCOPE ? t("notes.sharedInboxEmptyHint") : t("notes.emptyHint")}
                </p>
                {activeFolder !== SHARED_SCOPE && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleNew}
                    disabled={notesQuotaBlocked}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {t("notes.new")}
                  </button>
                  <Link
                    href="/settings?tab=integrations"
                    className="rounded-lg border border-zinc-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
                  >
                    {t("notes.emptyImport")}
                  </Link>
                </div>
                )}
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((note) => {
                  const isIncoming = !!(currentUid && note.userId && note.userId !== currentUid);
                  const teamName = note.teamId
                    ? teams.find((tm) => tm.id === note.teamId)?.name
                    : undefined;
                  return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => handleSelect(note)}
                    className={`w-full text-left px-3 py-2.5 border-b border-zinc-100 dark:border-slate-800 transition-colors ${
                      selectedId === note.id
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-l-2 border-l-emerald-500"
                        : "hover:bg-zinc-50 dark:hover:bg-slate-800/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {note.pinned && <span className="text-amber-500 text-[10px]">📌</span>}
                      {note.shared && note.teamId && (
                        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 shrink-0" title={t("notes.shareWith")}>👥</span>
                      )}
                      <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate flex-1">
                        {note.title || t("notes.untitled")}
                      </p>
                    </div>
                    {isIncoming && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="text-[9px] text-zinc-500 dark:text-slate-400 truncate max-w-full">
                          {note.ownerEmail
                            ? `${t("notes.sharedBy")} ${note.ownerEmail}`
                            : t("notes.sharedBy")}
                        </span>
                        {note.teamId ? (
                          <span className="inline-block bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 text-[9px] px-1 py-0.5 rounded">
                            {teamName || t("notes.sharedTeamBadge")}
                          </span>
                        ) : (
                          <span className="inline-block bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[9px] px-1 py-0.5 rounded">
                            {t("notes.sharedDirectBadge")}
                          </span>
                        )}
                        {note.collaboratorWrite && (
                          <span className="inline-block bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[9px] px-1 py-0.5 rounded">
                            {t("notes.sharedCanEditBadge")}
                          </span>
                        )}
                      </div>
                    )}
                    {(note.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {note.tags!.slice(0, 3).map((tag) => (
                          <span key={tag} className="inline-block bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[9px] px-1 py-0.5 rounded">{tag}</span>
                        ))}
                        {note.tags!.length > 3 && <span className="text-[9px] text-zinc-400 dark:text-slate-500">+{note.tags!.length - 3}</span>}
                      </div>
                    )}
                    <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-1">
                      {formatDate(note.updatedAt)}
                    </p>
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="px-3 py-2 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-2 text-[10px]">
            <span className={`w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-amber-500"}`} />
            <span className="text-zinc-500 dark:text-slate-400">
              {syncing
                ? t("notes.saving")
                : online
                  ? t("notes.synced")
                  : t("notes.offline")}
            </span>
            <span className="ml-auto text-zinc-400 dark:text-slate-500" data-testid="notes-status-counts">
              {t("notes.statusBarCounts")
                .replace("{{own}}", String(notes.filter((n) => isOwnNote(n)).length))
                .replace("{{shared}}", String(sharedNotes.length))}
            </span>
          </div>
        </div>

        {/* Editor */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobileShowEditor ? "flex" : "hidden md:flex"}`}>
          {selected ? (
            <>
              {/* Slim chrome — navigation & note actions only */}
              <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 border-b border-zinc-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileShowEditor(false)}
                  className="md:hidden p-1.5 -ml-1 rounded text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label={t("notes.back")}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex items-center gap-0.5 border border-zinc-200 dark:border-slate-700 rounded-md overflow-hidden shrink-0">
                  <button
                    type="button"
                    title={`${t("notes.prevNote")} (Alt+↑)`}
                    disabled={!noteNav.prev}
                    onClick={() => noteNav.prev && handleSelect(noteNav.prev)}
                    className="p-1.5 text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title={`${t("notes.nextNote")} (Alt+↓)`}
                    disabled={!noteNav.next}
                    onClick={() => noteNav.next && handleSelect(noteNav.next)}
                    className="p-1.5 text-zinc-600 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed border-l border-zinc-200 dark:border-slate-700"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 min-w-0" />
                {isSharedNote && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded px-1.5 py-0.5">
                    {t("notes.sharedReadOnly")}
                  </span>
                )}
                {notePresence.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0" title={t("notes.presenceHint")}>
                    {notePresence.slice(0, 4).map((p) => (
                      <span
                        key={p.uid}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-[9px] font-bold text-emerald-800 dark:text-emerald-200"
                      >
                        {(p.displayName || "?").slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
                {!isForeignNote && (
                  <button
                    type="button"
                    onClick={() => togglePin(selected.id)}
                    className={`p-1.5 rounded transition-colors ${
                      selected.pinned
                        ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20"
                        : "text-zinc-400 dark:text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    }`}
                    title={selected.pinned ? t("notes.unpin") : t("notes.pin")}
                  >
                    <svg className="w-4 h-4" fill={selected.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                )}
                {!isForeignNote && (
                  deleteConfirm === selected.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        data-testid="note-delete-confirm"
                        onClick={handleDelete}
                        className="rounded bg-red-500 text-white text-xs px-2 py-1 font-medium hover:bg-red-600"
                      >
                        {t("notes.delete")}
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(null)} className="text-xs text-zinc-500 dark:text-slate-400 px-2 py-1 hover:underline">
                        {t("edit.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid="note-delete-open"
                      onClick={() => setDeleteConfirm(selected.id)}
                      className="p-1.5 rounded text-zinc-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title={t("notes.delete")}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )
                )}
              </div>

              {!isSharedNote && (
                <NoteToolbar
                  editorRef={contentRef}
                  onOcr={ocrConfig?.enabled && diagramConfig?.enabled === false ? () => openOcr(null) : undefined}
                  onSpawnTasks={() => setSpawnOpen(true)}
                  onDiagram={diagramConfig?.enabled ? () => setDiagramOpen(true) : undefined}
                />
              )}

              {!isSharedNote && selected && (
                <SlashCommandMenu
                  editorRef={contentRef}
                  content={selected.content}
                  onContentChange={handleContentChange}
                  projects={projects}
                  onCreateTask={handleSlashCreateTask}
                  bindingNoteId={selected.id}
                  listenKey={focusedTextId}
                />
              )}

              {/* Document column: title, folded details, body */}
              <div className="flex-1 overflow-y-auto relative bg-white dark:bg-slate-900">
                <div className="w-full max-w-none self-stretch text-left px-4 sm:px-5 pt-4 sm:pt-5">
                  <input
                    ref={titleRef}
                    data-testid="note-title-input"
                    type="text"
                    value={selected.title}
                    onChange={(e) => !isSharedNote && handleTitleChange(e.target.value)}
                    readOnly={isSharedNote}
                    placeholder={t("notes.untitled")}
                    className={`w-full text-left text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-zinc-900 dark:text-slate-50 bg-transparent border-none outline-none placeholder-zinc-300 dark:placeholder-slate-600 mb-3 ${isSharedNote ? "cursor-default" : ""}`}
                  />

                  {isSharedNote && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-3">
                      {t("notes.sharedBy")} {selected.ownerEmail ?? selected.userId}
                    </p>
                  )}

                  <div className="mb-4 border-b border-zinc-100 dark:border-slate-800 pb-3">
                    <button
                      type="button"
                      onClick={() => setMetaOpen((o) => !o)}
                      className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-slate-400 hover:text-zinc-800 dark:hover:text-slate-200 transition-colors"
                      aria-expanded={metaOpen}
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${metaOpen ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="font-medium">{t("notes.details")}</span>
                      {!metaOpen && (
                        <span className="text-zinc-400 dark:text-slate-500 font-normal truncate max-w-[14rem] sm:max-w-xs">
                          — {[
                            selected.folder?.trim() || null,
                            (selected.tags?.length ?? 0) > 0 ? selected.tags!.slice(0, 2).join(", ") : null,
                            selected.shared && selected.teamId ? t("notes.shareWith") : null,
                            selected.sharedWithEmail || null,
                          ].filter(Boolean).join(" · ") || t("notes.detailsShow")}
                        </span>
                      )}
                    </button>

                    {metaOpen && (
                      <div className="mt-3 space-y-3 text-sm">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(selected.tags ?? []).map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-0.5 bg-zinc-100 dark:bg-slate-800 text-zinc-700 dark:text-slate-300 text-[11px] px-1.5 py-0.5 rounded font-medium">
                              {tag}
                              {!isForeignNote && (
                                <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 ml-0.5">×</button>
                              )}
                            </span>
                          ))}
                          {!isForeignNote && (
                            <input
                              type="text"
                              value={tagInput}
                              onChange={(e) => setTagInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && tagInput.trim()) { e.preventDefault(); handleAddTag(tagInput); }
                                if (e.key === "Backspace" && !tagInput && (selected.tags?.length ?? 0) > 0) {
                                  handleRemoveTag(selected.tags![selected.tags!.length - 1]);
                                }
                              }}
                              placeholder={t("notes.addTag")}
                              className="flex-1 min-w-[80px] bg-transparent text-[12px] text-zinc-700 dark:text-slate-300 outline-none placeholder-zinc-400 dark:placeholder-slate-500"
                            />
                          )}
                        </div>

                        {!isForeignNote && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium text-zinc-500 dark:text-slate-400 shrink-0">{t("notes.folderLabel")}</span>
                            <select
                              value={selected.folder ?? ""}
                              onChange={(e) => saveNote(selected.id, { folder: e.target.value })}
                              className="text-[12px] rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-zinc-800 dark:text-slate-200 px-2 py-1 max-w-[160px]"
                              title={t("notes.folderLabel")}
                            >
                              <option value="">{t("notes.folderNone")}</option>
                              {folderNames.map((fn) => (
                                <option key={fn} value={fn}>{fn}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={folderPickInput}
                              onChange={(e) => setFolderPickInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && folderPickInput.trim()) {
                                  saveNote(selected.id, { folder: folderPickInput.trim() });
                                  setFolderPickInput("");
                                }
                              }}
                              placeholder={t("notes.newFolderPlaceholder")}
                              className="flex-1 min-w-[100px] max-w-[200px] text-[12px] rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 outline-none focus:border-emerald-400"
                            />
                          </div>
                        )}

                        {!isForeignNote && (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-medium text-zinc-500 dark:text-slate-400 shrink-0">{t("notes.teamShareSection")}</span>
                              {teams.length === 0 ? (
                                <p className="text-[11px] text-zinc-400 dark:text-slate-500">{t("notes.teamShareNoTeams")}</p>
                              ) : (
                                <>
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[12px] text-zinc-700 dark:text-slate-300">
                                    <input
                                      type="checkbox"
                                      className="rounded border-zinc-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                                      checked={!!selected.shared && !!selected.teamId}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          const first = teams[0];
                                          if (first) saveNote(selected.id, { shared: true, teamId: first.id, sharedWithEmail: null });
                                        } else {
                                          saveNote(selected.id, { shared: false });
                                        }
                                      }}
                                    />
                                    {t("notes.shareWith")}
                                  </label>
                                  <select
                                    value={selected.teamId ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (!v) saveNote(selected.id, { shared: false });
                                      else saveNote(selected.id, { shared: true, teamId: v, sharedWithEmail: null });
                                    }}
                                    disabled={!selected.shared}
                                    className="text-[12px] rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-zinc-800 dark:text-slate-200 px-2 py-1 max-w-[200px] disabled:opacity-50"
                                    title={t("notes.selectTeam")}
                                  >
                                    {teams.map((tm) => (
                                      <option key={tm.id} value={tm.id}>{tm.name}</option>
                                    ))}
                                  </select>
                                  {!!selected.shared && !!selected.teamId && (
                                    <p className="w-full text-[11px] text-zinc-500 dark:text-slate-400">
                                      {t("notes.shareWithReadOnlyHint")}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-medium text-zinc-500 dark:text-slate-400 shrink-0">{t("notes.collaboratorShareSection")}</span>
                              <p className="w-full text-[11px] text-zinc-400 dark:text-slate-500">{t("notes.shareExclusiveHint")}</p>
                              {selected.sharedWithEmail ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[12px] text-zinc-700 dark:text-slate-300 bg-zinc-50 dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 rounded px-1.5 py-0.5">
                                    {selected.sharedWithEmail}
                                  </span>
                                  <label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={!!selected.collaboratorWrite}
                                      onChange={(e) =>
                                        saveNote(selected.id, { collaboratorWrite: e.target.checked })
                                      }
                                    />
                                    {t("notes.collaboratorWrite")}
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => saveNote(selected.id, { sharedWithEmail: null })}
                                    className="text-[11px] text-red-500 hover:text-red-600 hover:underline"
                                  >
                                    {t("notes.removeCollaboratorShare")}
                                  </button>
                                </div>
                              ) : (
                                <form
                                  className="flex items-center gap-1.5 flex-1 min-w-0"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const email = collabEmailInput.trim();
                                    if (!email) return;
                                    saveNote(selected.id, { sharedWithEmail: email, shared: false });
                                    setCollabEmailInput("");
                                  }}
                                >
                                  <input
                                    type="email"
                                    value={collabEmailInput}
                                    onChange={(e) => setCollabEmailInput(e.target.value)}
                                    placeholder={t("notes.collaboratorEmail")}
                                    className="flex-1 min-w-0 text-[12px] rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-zinc-800 dark:text-slate-200 px-2 py-1 outline-none focus:border-emerald-500"
                                  />
                                  <button
                                    type="submit"
                                    disabled={!collabEmailInput.trim()}
                                    className="shrink-0 text-[12px] font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-2.5 py-1 transition-colors"
                                  >
                                    {t("notes.shareWithCollaborator")}
                                  </button>
                                </form>
                              )}
                            </div>
                          </>
                        )}

                        {spawnedTasks.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[11px] font-medium text-zinc-500 dark:text-slate-400">{t("notes.spawn.listTitle")}</p>
                            <ul className="space-y-0.5">
                              {spawnedTasks.map((task) => (
                                <li key={task.id} className="flex items-center justify-between gap-2 text-[12px] text-zinc-700 dark:text-slate-200">
                                  <span className="truncate">{task.title}</span>
                                  <Link href={`/agenda?schedule=${encodeURIComponent(task.id)}`} className="shrink-0 text-emerald-700 dark:text-emerald-300 hover:underline">
                                    {t("notes.spawn.plan")}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {selected.todoId && (() => {
                          const linkedTask = todos.find((td) => td.id === selected.todoId);
                          return linkedTask ? (
                            <div className="flex items-center gap-1.5 text-[12px] text-zinc-500 dark:text-slate-400">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                              </svg>
                              <span className="truncate">{linkedTask.title}</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>

                  <NoteDocument
                    key={selected.id}
                    noteId={selected.id}
                    blocks={resolveNoteBlocks(selected)}
                    readOnly={isSharedNote}
                    refreshKey={attachmentsRefreshKey}
                    editorRef={contentRef}
                    onFocusText={setFocusedTextId}
                    onCommit={commitBlocks}
                    diagramApply={{
                      projects,
                      defaultProjectId: selected.projectId,
                      parentId: todos.find((task) => task.id === selected.todoId)?.scheduledSlot?.meetingUrl ? selected.todoId : null,
                      onCreated: () => refreshSpawned(selected.id),
                    }}
                  />
                </div>

                <NoteAttachmentsPanel
                  noteId={selected.id}
                  todoId={selected.todoId}
                  isOwner={selected.userId === currentUid}
                  onExtractText={ocrConfig?.enabled && !isSharedNote ? (att) => openOcr(att) : undefined}
                  refreshKey={attachmentsRefreshKey}
                />
              </div>

              {ocrConfig?.enabled && !isSharedNote && (
                <NoteOcrDialog
                  open={ocrOpen}
                  noteId={selected.id}
                  attachment={ocrAttachment}
                  canAttach={selected.userId === currentUid}
                  remaining={ocrConfig.remaining}
                  onClose={closeOcr}
                  onInsert={handleOcrInsert}
                  onAttachImage={handleOcrAttachImage}
                />
              )}
              {!isSharedNote && (
                <SpawnTasksDialog
                  open={spawnOpen}
                  noteId={selected.id}
                  lines={parseNoteTaskLines(selected.content || "")}
                  sourceHtml={selected.content || ""}
                  projects={projects}
                  defaultProjectId={selected.projectId}
                  onClose={() => setSpawnOpen(false)}
                  onCreated={() => refreshSpawned(selected.id)}
                />
              )}
              {!isSharedNote && (
                <DiagramImportDialog
                  open={diagramOpen}
                  noteId={selected.id}
                  projects={projects}
                  defaultProjectId={selected.projectId}
                  canAttach={selected.userId === currentUid}
                  replacesDiagram={(selected.diagram?.nodes.length ?? 0) > 0}
                  onClose={() => {
                    setDiagramOpen(false);
                    getDiagramConfig().then(setDiagramConfig).catch(() => {});
                  }}
                  onUseOcr={() => {
                    setDiagramOpen(false);
                    if (ocrConfig?.enabled) openOcr(null);
                    else toast.error(t("errors.code.OCR_DISABLED"));
                  }}
                  onAttachImage={handleOcrAttachImage}
                  onImport={({ nodes, edges, text }) => {
                    const html = text.trim() ? ocrTextToHtml(text) : "";
                    const next = appendCapture(resolveNoteBlocks(selected), nodes, edges, html);
                    saveNote(selected.id, { blocks: next, content: textHtmlFromBlocks(next) });
                    toast.success(t("notes.diagram.kept"));
                  }}
                  onTasksCreated={() => refreshSpawned(selected.id)}
                />
              )}

              {/* Footer */}
              <div className="px-4 py-1.5 border-t border-zinc-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-zinc-400 dark:text-slate-500 bg-white dark:bg-slate-900 shrink-0">
                <span>{t("notes.lastModified")} {formatDate(selected.updatedAt)}</span>
                <div className="flex items-center gap-3">
                  <span>{stripHtml(selected.content).length} car.</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center ui-v2-fade px-6">
                <svg className="w-16 h-16 mx-auto text-emerald-200 dark:text-emerald-900/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="text-sm text-zinc-400 dark:text-slate-500 mt-3">
                  {activeFolder === SHARED_SCOPE ? t("notes.sharedInboxEmptyHint") : t("notes.emptyHint")}
                </p>
                {activeFolder !== SHARED_SCOPE && (
                <button
                  type="button"
                  onClick={handleNew}
                  className="mt-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white shadow-sm shadow-emerald-500/25 px-4 py-2 text-sm font-medium transition-colors"
                >
                  {t("notes.new")}
                </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
      {deleteFolderModal && (() => {
        const deleteFolderNoteCount = notes.filter((x) => x.folder === deleteFolderModal && isOwnNote(x)).length;
        const isEmptyFolder = deleteFolderNoteCount === 0;
        return (
        <ViewportOverlay
          open
          onClose={() => { setDeleteFolderModal(null); setDeleteFolderChoice("a"); setDeleteFolderTarget(""); }}
          zClassName="z-[120]"
          backdropClassName="absolute inset-0 bg-black/50"
        >
          <div
            role="dialog"
            aria-labelledby="del-folder-title"
            className={sheetPanelClass(
              deleteFolderNarrow,
              "relative w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-folder-title" className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              {isEmptyFolder
                ? t("notes.deleteFolderEmptyTitle").replace("{{name}}", deleteFolderModal)
                : t("notes.deleteFolderTitle")
                    .replace("{{count}}", String(deleteFolderNoteCount))
                    .replace("{{name}}", deleteFolderModal)}
            </h2>
            {isEmptyFolder ? (
              <p className="text-sm text-zinc-600 dark:text-slate-400">{t("notes.deleteFolderEmptyHint")}</p>
            ) : (
            <div className="space-y-3 text-sm">
              <label className="flex gap-2 cursor-pointer items-start">
                <input type="radio" name="del-folder" checked={deleteFolderChoice === "a"} onChange={() => { setDeleteFolderChoice("a"); setDeleteFolderTarget(""); }} className="mt-1" />
                <span className="text-zinc-700 dark:text-slate-300">{t("notes.deleteFolderOptA")}</span>
              </label>
              <label className="flex gap-2 cursor-pointer items-start">
                <input type="radio" name="del-folder" checked={deleteFolderChoice === "b"} onChange={() => { setDeleteFolderChoice("b"); setDeleteFolderTarget(""); }} className="mt-1" />
                <span className="text-zinc-700 dark:text-slate-300">{t("notes.deleteFolderOptB")}</span>
              </label>
              {deleteFolderChoice === "b" && (
                <input
                  type="text"
                  value={deleteFolderTarget}
                  onChange={(e) => setDeleteFolderTarget(e.target.value)}
                  placeholder={t("notes.deleteFolderTargetHint")}
                  className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-zinc-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-zinc-900 dark:text-slate-100"
                />
              )}
              <label className="flex gap-2 cursor-pointer items-start">
                <input type="radio" name="del-folder" checked={deleteFolderChoice === "c"} onChange={() => { setDeleteFolderChoice("c"); setDeleteFolderTarget(""); }} className="mt-1" />
                <span className="text-zinc-700 dark:text-slate-300">{t("notes.deleteFolderOptC")}</span>
              </label>
              <label className="flex gap-2 cursor-pointer items-start">
                <input type="radio" name="del-folder" checked={deleteFolderChoice === "d"} onChange={() => { setDeleteFolderChoice("d"); setDeleteFolderTarget(""); }} className="mt-1" />
                <span className="text-red-700 dark:text-red-400">{t("notes.deleteFolderOptD")}</span>
              </label>
            </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => { setDeleteFolderModal(null); setDeleteFolderChoice("a"); setDeleteFolderTarget(""); }}
                className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
              >
                {t("notes.deleteFolderCancel")}
              </button>
              <button
                type="button"
                disabled={!isEmptyFolder && deleteFolderChoice === "b" && !deleteFolderTarget.trim()}
                onClick={() => void executeDeleteFolder()}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed ${!isEmptyFolder && deleteFolderChoice === "d" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
              >
                {t("notes.deleteFolderConfirm")}
              </button>
            </div>
          </div>
        </ViewportOverlay>
        );
      })()}
    </AppShell>
  );
}

export default function NotesPage() {
  return (
    <Suspense>
      <NotesPageInner />
    </Suspense>
  );
}
