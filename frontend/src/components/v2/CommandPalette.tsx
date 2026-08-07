"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTodo } from "@/lib/api/todos";
import { createProject } from "@/lib/api/projects";
import { createNoteApi } from "@/lib/api/notes";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { formatUserFacingError } from "@/lib/apiErrors";
import { useUiV2 } from "@/lib/UiVersionContext";

type Mode = "nav" | "create-task" | "create-project" | "create-note";
type CreateKind = "task" | "project" | "note";

interface NavItem {
  id: string;
  label: string;
  href: string;
  keywords: string;
}

/**
 * Global Cmd/Ctrl+K palette: navigate + quick-create (V2 only).
 */
export default function CommandPalette() {
  const { uiV2 } = useUiV2();
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("nav");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlight, setHighlight] = useState(0);

  const navItems: NavItem[] = useMemo(
    () => [
      { id: "dash", label: t("nav.home"), href: "/dashboard", keywords: "home dashboard" },
      { id: "todos", label: t("nav.myTasks"), href: "/todos", keywords: "tasks todos" },
      { id: "projects", label: t("nav.projects"), href: "/projects", keywords: "projects" },
      { id: "agenda", label: t("nav.myAgenda"), href: "/agenda", keywords: "agenda calendar" },
      { id: "notes", label: t("nav.notes"), href: "/notes", keywords: "notes" },
      { id: "teams", label: t("nav.myTeams"), href: "/teams", keywords: "teams" },
      { id: "settings", label: t("nav.settings"), href: "/settings", keywords: "settings" },
    ],
    [t],
  );

  const createKinds: { kind: CreateKind; mode: Mode; label: string; asTitle: (title: string) => string }[] = useMemo(
    () => [
      {
        kind: "task",
        mode: "create-task",
        label: t("uiV2.createTask"),
        asTitle: (title) => t("uiV2.paletteCreateAsTask").replace("{{title}}", title),
      },
      {
        kind: "project",
        mode: "create-project",
        label: t("uiV2.createProject"),
        asTitle: (title) => t("uiV2.paletteCreateAsProject").replace("{{title}}", title),
      },
      {
        kind: "note",
        mode: "create-note",
        label: t("uiV2.createNote"),
        asTitle: (title) => t("uiV2.paletteCreateAsNote").replace("{{title}}", title),
      },
    ],
    [t],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setMode("nav");
    setHighlight(0);
  }, []);

  useEffect(() => {
    if (!uiV2) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ kind?: string }>).detail;
      setOpen(true);
      if (detail?.kind === "task") setMode("create-task");
      else if (detail?.kind === "project") setMode("create-project");
      else if (detail?.kind === "note") setMode("create-note");
      else setMode("nav");
      setQuery("");
      setHighlight(0);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("wroket-open-palette", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("wroket-open-palette", onOpen);
    };
  }, [uiV2]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, mode]);

  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navItems;
    return navItems.filter(
      (n) => n.label.toLowerCase().includes(q) || n.keywords.includes(q),
    );
  }, [navItems, query]);

  const trimmed = query.trim();
  const inCreateMode = mode !== "nav";

  /** Create rows always visible in create mode; in nav mode when typing a title. */
  const createRows = useMemo(() => {
    if (inCreateMode) {
      return createKinds.map((c) => ({
        ...c,
        display: trimmed ? c.asTitle(trimmed) : c.label,
      }));
    }
    if (trimmed) {
      return createKinds.map((c) => ({
        ...c,
        display: c.asTitle(trimmed),
      }));
    }
    return createKinds.map((c) => ({
      ...c,
      display: c.label,
    }));
  }, [createKinds, inCreateMode, trimmed]);

  const listLength = inCreateMode
    ? createRows.length
    : createRows.length + filteredNav.length;

  const runCreate = async (kind: CreateKind) => {
    const title = query.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      if (kind === "task") {
        const todo = await createTodo({ title, priority: "medium", effort: "medium" });
        toast.success(t("uiV2.taskCreated"));
        close();
        router.push(`/todos?highlight=${todo.id}`);
      } else if (kind === "project") {
        const project = await createProject({ name: title });
        toast.success(t("uiV2.projectCreated"));
        close();
        router.push(`/projects/${project.id}`);
      } else {
        const note = await createNoteApi({ title });
        toast.success(t("uiV2.noteCreated"));
        close();
        router.push(`/notes?id=${note.id}`);
      }
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.createError"));
    } finally {
      setBusy(false);
    }
  };

  const activateHighlight = () => {
    if (highlight < createRows.length) {
      const row = createRows[highlight];
      if (!trimmed) {
        setMode(row.mode);
        setHighlight(0);
        return;
      }
      void runCreate(row.kind);
      return;
    }
    if (!inCreateMode) {
      const nav = filteredNav[highlight - createRows.length];
      if (nav) {
        close();
        router.push(nav.href);
      }
    }
  };

  if (!uiV2 || !open) return null;

  const placeholder = inCreateMode
    ? (mode === "create-project"
        ? t("uiV2.paletteProjectPlaceholder")
        : mode === "create-note"
          ? t("uiV2.paletteNotePlaceholder")
          : t("uiV2.paletteTaskPlaceholder"))
    : t("uiV2.palettePlaceholder");

  const rowCls = (active: boolean) =>
    `w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
      active
        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300"
        : "text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("uiV2.paletteTitle")}
        className="relative w-full max-w-lg rounded-sm border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl ui-v2-fade overflow-hidden"
      >
        <div className="flex items-center gap-2 h-12 px-3 border-b border-zinc-100 dark:border-slate-800">
          {inCreateMode && (
            <button
              type="button"
              onClick={() => { setMode("nav"); setHighlight(0); }}
              className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-slate-200 shrink-0 leading-none"
              aria-label="Back"
            >
              ←
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                if (inCreateMode) { setMode("nav"); setHighlight(0); }
                else close();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(0, listLength - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                activateHighlight();
              }
            }}
            placeholder={placeholder}
            disabled={busy}
            className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none ring-0 focus:ring-0 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 dark:placeholder:text-slate-500 disabled:opacity-60"
          />
          <kbd className="hidden sm:inline shrink-0 text-[10px] leading-none text-zinc-400 dark:text-slate-500 border border-zinc-200 dark:border-slate-600 rounded px-1.5 py-1">
            esc
          </kbd>
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-slate-500">
            {t("uiV2.paletteCreate")}
          </div>
          {createRows.map((row, i) => (
            <button
              key={row.kind}
              type="button"
              disabled={busy}
              onClick={() => {
                if (!trimmed) {
                  setMode(row.mode);
                  setHighlight(i);
                  inputRef.current?.focus();
                  return;
                }
                void runCreate(row.kind);
              }}
              className={`${rowCls(highlight === i)} disabled:opacity-50`}
            >
              <span className="text-emerald-600 dark:text-emerald-400 font-medium shrink-0">+</span>
              <span className="truncate">{row.display}</span>
            </button>
          ))}

          {!inCreateMode && filteredNav.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-slate-500 mt-1">
                {t("uiV2.paletteNavigate")}
              </div>
              {filteredNav.map((n, i) => {
                const idx = createRows.length + i;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => { close(); router.push(n.href); }}
                    className={rowCls(highlight === idx)}
                  >
                    {n.label}
                  </button>
                );
              })}
            </>
          )}

          {busy && (
            <p className="px-4 py-2 text-xs text-zinc-500 dark:text-slate-400">{t("todos.adding")}</p>
          )}
          {!busy && trimmed && (
            <p className="px-3 py-2 text-[11px] text-zinc-400 dark:text-slate-500">
              {t("uiV2.paletteEnterHint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
