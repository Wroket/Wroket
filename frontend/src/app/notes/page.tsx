"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import SlashCommandMenu from "@/components/SlashCommandMenu";
import type { SlashTaskPayload } from "@/components/SlashCommandMenu";
import { useLocale } from "@/lib/LocaleContext";
import { useOfflineNotes } from "@/lib/useOfflineNotes";
import { getProjects, createTodo, lookupUser } from "@/lib/api";
import type { Note, Project } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n";

export default function NotesPage() {
  const { t } = useLocale();
  const { notes, loading, online, syncing, addNote, saveNote, removeNote, togglePin } = useOfflineNotes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => {});
  }, []);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const filtered = search
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  const handleNew = useCallback(async () => {
    const id = await addNote();
    setSelectedId(id);
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [addNote]);

  const handleSelect = useCallback((note: Note) => {
    setSelectedId(note.id);
    setDeleteConfirm(null);
  }, []);

  const handleTitleChange = useCallback((value: string) => {
    if (!selectedId) return;
    saveNote(selectedId, { title: value });
  }, [selectedId, saveNote]);

  const handleContentChange = useCallback((value: string) => {
    if (!selectedId) return;
    saveNote(selectedId, { content: value });
  }, [selectedId, saveNote]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    await removeNote(deleteConfirm);
    if (selectedId === deleteConfirm) {
      setSelectedId(notes.find((n) => n.id !== deleteConfirm)?.id ?? null);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, removeNote, selectedId, notes]);

  useEffect(() => {
    if (notes.length > 0 && !selectedId) {
      setSelectedId(notes[0].id);
    }
  }, [notes, selectedId]);

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

  const handleSlashCreateTask = useCallback(async (payload: SlashTaskPayload) => {
    let assignedToUid: string | undefined;
    if (payload.assignedTo) {
      const user = await lookupUser(payload.assignedTo);
      if (user) assignedToUid = user.uid;
    }
    await createTodo({
      title: payload.title,
      priority: payload.priority,
      deadline: payload.deadline ?? null,
      projectId: payload.projectId ?? null,
      assignedTo: assignedToUid ?? null,
    });
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-65px)] overflow-hidden">
        {/* Sidebar - Note list */}
        <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-slate-700 flex flex-col bg-zinc-50 dark:bg-slate-900/50">
          {/* Header */}
          <div className="p-3 border-b border-zinc-200 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-slate-100">
                {t("notes.title" as TranslationKey)}
              </h1>
              <div className="flex items-center gap-1.5 relative">
                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  className={`rounded-lg p-1.5 transition-colors ${showHelp ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" : "text-zinc-400 dark:text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"}`}
                  title="Aide & commandes"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </button>
                {showHelp && (
                  <>
                    <div className="fixed inset-0 z-[50]" onClick={() => setShowHelp(false)} />
                    <div className="absolute top-full right-0 mt-2 z-[60] w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-zinc-200 dark:border-slate-600 p-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-700 dark:text-slate-200 mb-1.5">Commandes /</p>
                        <p className="text-[10px] text-zinc-500 dark:text-slate-400 mb-2">Tapez <kbd className="font-mono bg-zinc-100 dark:bg-slate-700 px-1 rounded">/</kbd> dans l&apos;éditeur pour ouvrir le menu.</p>
                        <div className="space-y-1">
                          {[
                            { cmd: "/task", desc: "Créer une tâche" },
                            { cmd: "/assign", desc: "Mentionner un collaborateur" },
                            { cmd: "/deadline", desc: "Insérer une échéance" },
                            { cmd: "/project", desc: "Lier à un projet" },
                            { cmd: "/date", desc: "Date du jour" },
                            { cmd: "/time", desc: "Heure actuelle" },
                            { cmd: "/code", desc: "Bloc de code" },
                          ].map((item) => (
                            <div key={item.cmd} className="flex items-center gap-2">
                              <code className="text-[10px] font-mono font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded shrink-0">{item.cmd}</code>
                              <span className="text-[10px] text-zinc-500 dark:text-slate-400 truncate">{item.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="border-t border-zinc-100 dark:border-slate-700 pt-2">
                        <div className="flex items-start gap-2">
                          <span className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          </span>
                          <div>
                            <p className="text-[10px] font-semibold text-zinc-700 dark:text-slate-200">Mode hors ligne</p>
                            <p className="text-[10px] text-zinc-500 dark:text-slate-400 leading-relaxed">
                              Les notes sont sauvegardées localement et se synchronisent automatiquement au retour en ligne.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-zinc-100 dark:border-slate-700 pt-2">
                        <p className="text-[10px] text-zinc-400 dark:text-slate-500">
                          <kbd className="font-mono bg-zinc-100 dark:bg-slate-700 px-1 rounded">Ctrl+N</kbd> nouvelle note
                        </p>
                      </div>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleNew}
                  className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 transition-colors"
                  title={t("notes.new" as TranslationKey)}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder={t("notes.search" as TranslationKey)}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-slate-100 placeholder-zinc-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-sm text-zinc-400 dark:text-slate-500">{t("notes.empty" as TranslationKey)}</p>
                <p className="text-xs text-zinc-400 dark:text-slate-500 mt-1">{t("notes.emptyHint" as TranslationKey)}</p>
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => handleSelect(note)}
                    className={`w-full text-left px-3 py-2.5 border-b border-zinc-100 dark:border-slate-800 transition-colors ${
                      selectedId === note.id
                        ? "bg-indigo-50 dark:bg-indigo-950/30 border-l-2 border-l-indigo-500"
                        : "hover:bg-zinc-100 dark:hover:bg-slate-800/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {note.pinned && <span className="text-amber-500 text-[10px]">📌</span>}
                      <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate flex-1">
                        {note.title || t("notes.untitled" as TranslationKey)}
                      </p>
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-slate-500 truncate mt-0.5 leading-relaxed">
                      {note.content.slice(0, 80) || "..."}
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-1">
                      {formatDate(note.updatedAt)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="px-3 py-2 border-t border-zinc-200 dark:border-slate-700 flex items-center gap-2 text-[10px]">
            <span className={`w-2 h-2 rounded-full ${online ? "bg-green-500" : "bg-amber-500"}`} />
            <span className="text-zinc-500 dark:text-slate-400">
              {syncing
                ? t("notes.saving" as TranslationKey)
                : online
                  ? t("notes.synced" as TranslationKey)
                  : t("notes.offline" as TranslationKey)}
            </span>
            <span className="ml-auto text-zinc-400 dark:text-slate-500">{notes.length} notes</span>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {selected ? (
            <>
              {/* Editor toolbar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <input
                  ref={titleRef}
                  type="text"
                  value={selected.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={t("notes.untitled" as TranslationKey)}
                  className="flex-1 text-lg font-semibold text-zinc-900 dark:text-slate-100 bg-transparent border-none outline-none placeholder-zinc-300 dark:placeholder-slate-600"
                />
                <button
                  type="button"
                  onClick={() => togglePin(selected.id)}
                  className={`p-1.5 rounded transition-colors ${
                    selected.pinned
                      ? "text-amber-500 bg-amber-50 dark:bg-amber-900/20"
                      : "text-zinc-400 dark:text-slate-500 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  }`}
                  title={selected.pinned ? t("notes.unpin" as TranslationKey) : t("notes.pin" as TranslationKey)}
                >
                  <svg className="w-4 h-4" fill={selected.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                {deleteConfirm === selected.id ? (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={handleDelete} className="rounded bg-red-500 text-white text-xs px-2 py-1 font-medium hover:bg-red-600">
                      {t("notes.delete" as TranslationKey)}
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(null)} className="text-xs text-zinc-500 dark:text-slate-400 px-2 py-1 hover:underline">
                      {t("edit.cancel" as TranslationKey)}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(selected.id)}
                    className="p-1.5 rounded text-zinc-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t("notes.delete" as TranslationKey)}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto relative">
                <textarea
                  ref={contentRef}
                  value={selected.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder={t("notes.contentPlaceholder" as TranslationKey)}
                  className="w-full h-full resize-none px-6 py-4 text-sm text-zinc-800 dark:text-slate-200 bg-white dark:bg-slate-900 border-none outline-none placeholder-zinc-300 dark:placeholder-slate-600 leading-relaxed font-mono"
                  spellCheck
                />
                <SlashCommandMenu
                  textareaRef={contentRef}
                  content={selected.content}
                  onContentChange={handleContentChange}
                  projects={projects}
                  onCreateTask={handleSlashCreateTask}
                />
              </div>

              {/* Footer */}
              <div className="px-4 py-1.5 border-t border-zinc-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-zinc-400 dark:text-slate-500 bg-white dark:bg-slate-900 shrink-0">
                <span>{t("notes.lastModified" as TranslationKey)} {formatDate(selected.updatedAt)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-300 dark:text-slate-600">
                    <kbd className="font-mono bg-zinc-100 dark:bg-slate-700 px-1 rounded text-[9px]">/</kbd> commandes
                  </span>
                  <span>{selected.content.length} car.</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-zinc-200 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="text-sm text-zinc-400 dark:text-slate-500 mt-3">{t("notes.emptyHint" as TranslationKey)}</p>
                <button
                  type="button"
                  onClick={handleNew}
                  className="mt-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium transition-colors"
                >
                  {t("notes.new" as TranslationKey)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
