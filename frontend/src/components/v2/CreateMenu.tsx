"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/LocaleContext";
import Modal from "@/components/ui/Modal";
import QuickCreateTask from "@/components/v2/QuickCreateTask";
import { createProject } from "@/lib/api/projects";
import { createNoteApi } from "@/lib/api/notes";
import { useToast } from "@/components/Toast";
import { formatUserFacingError } from "@/lib/apiErrors";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type CreateKind = "menu" | "task" | "project" | "note" | null;

/**
 * Global create CTA (+ menu / modals) for UI V2 shell.
 */
export default function CreateMenu({ fab = false }: { fab?: boolean }) {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [kind, setKind] = useState<CreateKind>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (kind !== "menu") return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setKind(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [kind]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ kind?: string }>).detail;
      if (detail?.kind === "task") setKind("task");
      else if (detail?.kind === "project") setKind("project");
      else if (detail?.kind === "note") setKind("note");
      else setKind("menu");
    };
    window.addEventListener("wroket-open-create", onOpen);
    return () => window.removeEventListener("wroket-open-create", onOpen);
  }, []);

  const createProjectNow = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const p = await createProject({ name: trimmed });
      toast.success(t("uiV2.projectCreated"));
      setKind(null);
      setName("");
      router.push(`/projects/${p.id}`);
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.createError"));
    } finally {
      setBusy(false);
    }
  };

  const createNoteNow = async () => {
    setBusy(true);
    try {
      const note = await createNoteApi({ title: name.trim() || undefined });
      toast.success(t("uiV2.noteCreated"));
      setKind(null);
      setName("");
      router.push(`/notes?id=${note.id}`);
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.createError"));
    } finally {
      setBusy(false);
    }
  };

  const menuItems = (
    <div
      className={`absolute z-50 min-w-[12rem] py-1 rounded-sm border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg ui-v2-fade ${
        fab ? "bottom-full right-0 mb-2" : "top-full right-0 mt-2"
      }`}
    >
      {(
        [
          ["task", t("uiV2.createTask")],
          ["project", t("uiV2.createProject")],
          ["note", t("uiV2.createNote")],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          className="w-full text-left px-3 py-2 text-sm text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
          onClick={() => { setName(""); setKind(k); }}
        >
          {label}
        </button>
      ))}
      <hr className="my-1 border-zinc-100 dark:border-slate-800" />
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-xs text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-800"
        onClick={() => {
          setKind(null);
          window.dispatchEvent(new CustomEvent("wroket-open-palette", { detail: {} }));
        }}
      >
        {t("uiV2.openPalette")} <kbd className="ml-1 opacity-70">⌘K</kbd>
      </button>
    </div>
  );

  return (
    <>
      <div
        ref={rootRef}
        className={fab ? "fixed bottom-5 right-5 z-40 md:hidden" : "relative hidden sm:block"}
      >
        <button
          type="button"
          className={
            fab
              ? "w-14 h-14 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:bg-emerald-700 dark:hover:bg-emerald-400 transition-colors"
              : "inline-flex items-center gap-1.5 rounded-sm bg-emerald-600 dark:bg-emerald-500 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 dark:hover:bg-emerald-400 shadow-sm shadow-emerald-500/25 transition-colors"
          }
          aria-label={t("uiV2.create")}
          onClick={() => setKind((k) => (k === "menu" ? null : "menu"))}
        >
          {fab ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t("uiV2.create")}
            </>
          )}
        </button>
        {kind === "menu" && menuItems}
      </div>

      <Modal open={kind === "task"} onClose={() => setKind(null)} title={t("uiV2.createTask")}>
        <QuickCreateTask
          variant="inline"
          onCreated={(id) => {
            setKind(null);
            router.push(`/todos?highlight=${id}`);
          }}
        />
      </Modal>

      <Modal
        open={kind === "project"}
        onClose={() => setKind(null)}
        title={t("uiV2.createProject")}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setKind(null)}>{t("projects.cancel")}</Button>
            <Button size="sm" disabled={busy || !name.trim()} onClick={() => void createProjectNow()}>
              {busy ? t("todos.adding") : t("projects.save")}
            </Button>
          </>
        }
      >
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
          {t("projects.name")}
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("projects.namePlaceholder")}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") void createProjectNow(); }}
        />
        <p className="mt-2 text-xs text-zinc-400 dark:text-slate-500">{t("uiV2.projectCreateHint")}</p>
      </Modal>

      <Modal
        open={kind === "note"}
        onClose={() => setKind(null)}
        title={t("uiV2.createNote")}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setKind(null)}>{t("projects.cancel")}</Button>
            <Button size="sm" disabled={busy} onClick={() => void createNoteNow()}>
              {busy ? t("todos.adding") : t("notes.new")}
            </Button>
          </>
        }
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("notes.contentPlaceholder")}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") void createNoteNow(); }}
        />
      </Modal>
    </>
  );
}
