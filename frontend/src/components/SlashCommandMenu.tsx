"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Project, Priority } from "@/lib/api";

/* ─── Types ─── */

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  execute?: () => string;
  interactive?: boolean;
}

export interface SlashTaskPayload {
  title: string;
  priority: Priority;
  deadline?: string;
  projectId?: string;
  assignedTo?: string;
}

export interface SlashCommandMenuProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (newContent: string) => void;
  projects?: Project[];
  onCreateTask?: (payload: SlashTaskPayload) => Promise<void>;
}

/* ─── Built-in commands ─── */

const BUILTIN_COMMANDS: SlashCommand[] = [
  { id: "task",     label: "Créer une tâche",  description: "Nouvelle tâche depuis la note",     icon: "✅", interactive: true },
  { id: "assign",   label: "Assigner",         description: "Mentionner un collaborateur",       icon: "👤", interactive: true },
  { id: "deadline", label: "Échéance",         description: "Insérer une date d'échéance",       icon: "⏰", interactive: true },
  { id: "project",  label: "Projet",           description: "Lier à un projet",                  icon: "📁", interactive: true },
  { id: "date",     label: "Date",             description: "Date du jour",                      icon: "📅", execute: () => new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) },
  { id: "time",     label: "Heure",            description: "Heure actuelle",                    icon: "🕐", execute: () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) },
  { id: "datetime", label: "Date & Heure",     description: "Date et heure actuelles",           icon: "📆", execute: () => { const n = new Date(); return `${n.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${n.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`; } },
  // { id: "todo",     label: "Checklist",        description: "Liste de cases à cocher",           icon: "☑️", execute: () => "- [ ] \n- [ ] \n- [ ] " },
  // { id: "list",     label: "Liste",            description: "Liste à puces",                     icon: "📋", execute: () => "- \n- \n- " },
  // { id: "h1",       label: "Titre 1",          description: "Grand titre",                       icon: "H₁", execute: () => "# " },
  // { id: "h2",       label: "Titre 2",          description: "Sous-titre",                        icon: "H₂", execute: () => "## " },
  // { id: "h3",       label: "Titre 3",          description: "Section",                           icon: "H₃", execute: () => "### " },
  // { id: "hr",       label: "Séparateur",       description: "Ligne horizontale",                 icon: "➖", execute: () => "\n---\n" },
  { id: "code",     label: "Bloc de code",     description: "Zone de code formatée",             icon: "💻", execute: () => "```\n\n```" },
  // { id: "table",    label: "Tableau",          description: "Tableau 3 colonnes",                icon: "📊", execute: () => "| Col 1 | Col 2 | Col 3 |\n|-------|-------|-------|\n|       |       |       |" },
  // { id: "quote",    label: "Citation",         description: "Bloc de citation",                  icon: "💬", execute: () => "> " },
  // { id: "link",     label: "Lien",             description: "Insérer un lien",                   icon: "🔗", execute: () => "[texte](url)" },
  // { id: "image",    label: "Image",            description: "Référence image",                   icon: "🖼️", execute: () => "![alt](url)" },
  // { id: "note",     label: "Note",             description: "Bloc note/remarque",                icon: "📝", execute: () => "> **Note :** " },
  { id: "warning",  label: "Attention",        description: "Bloc avertissement",                icon: "⚠️", execute: () => "> **⚠️ Attention :** " },
];

/* ─── Component ─── */

export default function SlashCommandMenu({ textareaRef, content, onContentChange, projects, onCreateTask }: SlashCommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [slashStart, setSlashStart] = useState(-1);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("medium");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskProject, setTaskProject] = useState("");
  const [taskAssign, setTaskAssign] = useState("");
  const [taskCreating, setTaskCreating] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [deadlineValue, setDeadlineValue] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  const slashStartRef = useRef(slashStart);
  slashStartRef.current = slashStart;
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => { setMounted(true); }, []);

  const filtered = useMemo(() => {
    if (!query) return BUILTIN_COMMANDS;
    const q = query.toLowerCase();
    return BUILTIN_COMMANDS.filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || cmd.id.includes(q) || cmd.description.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSlashStart(-1);
    setActivePanel(null);
  }, []);

  const insertText = useCallback((text: string) => {
    const textarea = textareaRef.current;
    const start = slashStartRef.current;
    if (!textarea || start < 0) return;
    const cur = contentRef.current;
    const cursorPos = textarea.selectionStart;
    const before = cur.slice(0, start);
    const after = cur.slice(Math.max(cursorPos, start));
    const newContent = before + text + after;
    onContentChange(newContent);
    closeMenu();
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = start + text.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  }, [onContentChange, closeMenu, textareaRef]);

  const getCurrentLineText = useCallback(() => {
    const start = slashStartRef.current;
    const cur = contentRef.current;
    if (start < 0) return "";
    const lineStart = cur.lastIndexOf("\n", start - 1) + 1;
    return cur.slice(lineStart, start).trim();
  }, []);

  const openPanel = useCallback((panelId: string) => {
    setActivePanel(panelId);
    if (panelId === "task") {
      setTaskTitle(getCurrentLineText());
      setTaskPriority("medium");
      setTaskDeadline("");
      setTaskProject("");
      setTaskAssign("");
    } else if (panelId === "assign") {
      setAssignEmail("");
    } else if (panelId === "deadline") {
      setDeadlineValue("");
    } else if (panelId === "project") {
      setProjectSearch("");
    }
  }, [getCurrentLineText]);

  const executeCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.interactive) {
      openPanel(cmd.id);
      return;
    }
    if (cmd.execute) insertText(cmd.execute());
  }, [openPanel, insertText]);

  /* ── Interactive action handlers ── */

  const handleCreateTask = useCallback(async () => {
    if (!taskTitle.trim() || !onCreateTask) return;
    setTaskCreating(true);
    try {
      await onCreateTask({
        title: taskTitle.trim(),
        priority: taskPriority,
        deadline: taskDeadline || undefined,
        projectId: taskProject || undefined,
        assignedTo: taskAssign || undefined,
      });
      insertText(`✅ Tâche créée : "${taskTitle.trim()}"` + (taskDeadline ? ` — échéance ${taskDeadline}` : "") + (taskProject ? ` — projet lié` : ""));
    } catch {
      insertText(`❌ Erreur création tâche : "${taskTitle.trim()}"`);
    }
    setTaskCreating(false);
  }, [taskTitle, taskPriority, taskDeadline, taskProject, taskAssign, onCreateTask, insertText]);

  const handleAssign = useCallback(() => {
    if (!assignEmail.trim()) return;
    insertText(`👤 @${assignEmail.trim()}`);
  }, [assignEmail, insertText]);

  const handleDeadline = useCallback(() => {
    if (!deadlineValue) return;
    const d = new Date(deadlineValue);
    const formatted = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    insertText(`📅 Échéance : ${formatted}`);
  }, [deadlineValue, insertText]);

  const handleSelectProject = useCallback((project: Project) => {
    insertText(`📁 Projet : ${project.name}`);
  }, [insertText]);

  /* ── Position computing ── */

  const computeMenuPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return { top: 0, left: 0 };
    const rect = textarea.getBoundingClientRect();
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const textBefore = content.slice(0, slashStart);
    const lines = textBefore.split("\n");
    const lineIndex = lines.length - 1;
    const charIndex = lines[lineIndex].length;
    const charWidth = parseFloat(style.fontSize) * 0.6;
    const top = rect.top + paddingTop + (lineIndex + 1) * lineHeight - textarea.scrollTop + 4;
    const left = rect.left + paddingLeft + charIndex * charWidth;
    return { top: Math.min(top, window.innerHeight - 380), left: Math.min(left, window.innerWidth - 300) };
  }, [textareaRef, content, slashStart]);

  /* ── Textarea event listeners (only for command list, NOT panels) ── */

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      if (activePanel) return;
      const cursor = textarea.selectionStart;
      const text = textarea.value;
      const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
      const textBeforeCursor = text.slice(lineStart, cursor);
      const slashMatch = textBeforeCursor.match(/\/(\w*)$/);
      if (slashMatch) {
        const matchStart = lineStart + slashMatch.index!;
        setSlashStart(matchStart);
        setQuery(slashMatch[1]);
        setOpen(true);
      } else if (open && !activePanel) {
        closeMenu();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || activePanel) return;
      if (filtered.length === 0) {
        if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault(); executeCommand(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault(); closeMenu();
      }
    };

    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("keydown", handleKeyDown);
    return () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleKeyDown);
    };
  }, [textareaRef, open, filtered, selectedIndex, executeCommand, closeMenu, activePanel]);

  /* ── Global Escape for panels ── */
  useEffect(() => {
    if (!activePanel) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    };
    document.addEventListener("keydown", handleEsc, true);
    return () => document.removeEventListener("keydown", handleEsc, true);
  }, [activePanel, closeMenu]);

  /* ── Outside click ── */
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, closeMenu]);

  useEffect(() => {
    if (open && !activePanel) setMenuPos(computeMenuPosition());
  }, [open, slashStart, computeMenuPosition, activePanel]);

  if (!mounted || !open) return null;

  const inputCls = "w-full rounded border border-zinc-200 dark:border-slate-600 bg-zinc-50 dark:bg-slate-700 text-zinc-900 dark:text-slate-100 text-xs px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400";
  const btnPrimaryCls = "rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-40 transition-colors";
  const btnSecondaryCls = "rounded border border-zinc-200 dark:border-slate-600 text-zinc-600 dark:text-slate-300 text-xs px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-slate-700 transition-colors";

  const filteredProjects = projects?.filter((p) =>
    !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase())
  ) ?? [];

  /* ── Panel renderers ── */

  const renderPanel = () => {
    switch (activePanel) {
      case "task":
        return (
          <div className="p-3 space-y-2.5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">✅</span>
              <p className="text-xs font-semibold text-zinc-700 dark:text-slate-200">Créer une tâche</p>
            </div>
            <input autoFocus type="text" placeholder="Titre de la tâche" value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateTask(); } }}
              className={inputCls} />
            <div className="grid grid-cols-2 gap-2">
              <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as Priority)} className={inputCls}>
                <option value="high">🔴 Haute</option>
                <option value="medium">🟡 Moyenne</option>
                <option value="low">🟢 Basse</option>
              </select>
              <input type="date" value={taskDeadline} min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setTaskDeadline(e.target.value)} className={inputCls} />
            </div>
            {projects && projects.length > 0 && (
              <select value={taskProject} onChange={(e) => setTaskProject(e.target.value)} className={inputCls}>
                <option value="">— Projet (optionnel) —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <input type="email" placeholder="Assigner à (email, optionnel)" value={taskAssign}
              onChange={(e) => setTaskAssign(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreateTask(); } }}
              className={inputCls} />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleCreateTask} disabled={!taskTitle.trim() || taskCreating} className={btnPrimaryCls}>
                {taskCreating ? "Création..." : "Créer la tâche"}
              </button>
              <button type="button" onClick={closeMenu} className={btnSecondaryCls}>Annuler</button>
            </div>
          </div>
        );

      case "assign":
        return (
          <div className="p-3 space-y-2.5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">👤</span>
              <p className="text-xs font-semibold text-zinc-700 dark:text-slate-200">Mentionner un collaborateur</p>
            </div>
            <input autoFocus type="email" placeholder="Email du collaborateur" value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAssign(); } }}
              className={inputCls} />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleAssign} disabled={!assignEmail.trim()} className={btnPrimaryCls}>Insérer</button>
              <button type="button" onClick={closeMenu} className={btnSecondaryCls}>Annuler</button>
            </div>
          </div>
        );

      case "deadline":
        return (
          <div className="p-3 space-y-2.5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">⏰</span>
              <p className="text-xs font-semibold text-zinc-700 dark:text-slate-200">Fixer une échéance</p>
            </div>
            <input autoFocus type="date" min={new Date().toISOString().split("T")[0]} value={deadlineValue}
              onChange={(e) => setDeadlineValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleDeadline(); } }}
              className={inputCls} />
            <div className="flex gap-2 pt-1 flex-wrap">
              {["Aujourd'hui", "Demain", "Dans 1 semaine"].map((label, i) => {
                const d = new Date();
                if (i === 1) d.setDate(d.getDate() + 1);
                if (i === 2) d.setDate(d.getDate() + 7);
                const val = d.toISOString().split("T")[0];
                return (
                  <button key={label} type="button" onClick={() => setDeadlineValue(val)}
                    className={`rounded text-[10px] px-2 py-1 transition-colors ${
                      deadlineValue === val
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-semibold"
                        : "bg-zinc-100 dark:bg-slate-700 text-zinc-600 dark:text-slate-300 hover:bg-zinc-200 dark:hover:bg-slate-600"
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleDeadline} disabled={!deadlineValue} className={btnPrimaryCls}>Insérer</button>
              <button type="button" onClick={closeMenu} className={btnSecondaryCls}>Annuler</button>
            </div>
          </div>
        );

      case "project":
        return (
          <div className="p-3 space-y-2.5" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">📁</span>
              <p className="text-xs font-semibold text-zinc-700 dark:text-slate-200">Lier à un projet</p>
            </div>
            <input autoFocus type="text" placeholder="Rechercher un projet..." value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)} className={inputCls} />
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {filteredProjects.length === 0 ? (
                <p className="text-[10px] text-zinc-400 dark:text-slate-500 italic py-2 text-center">Aucun projet trouvé</p>
              ) : filteredProjects.map((p) => (
                <button key={p.id} type="button" onClick={() => handleSelectProject(p)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-zinc-900 dark:text-slate-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                    {p.name[0]?.toUpperCase()}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={closeMenu} className={btnSecondaryCls + " w-full"}>Annuler</button>
          </div>
        );

      default:
        return null;
    }
  };

  /* ── Render via portal for guaranteed z-index stacking ── */

  const menuContent = activePanel ? (
    <div ref={menuRef}
      className="fixed z-[9999] w-72 bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-600"
      style={{ top: menuPos.top, left: menuPos.left }}
      onMouseDown={(e) => e.stopPropagation()}>
      {renderPanel()}
    </div>
  ) : filtered.length === 0 ? null : (
    <div ref={menuRef}
      className="fixed z-[9999] w-60 max-h-72 overflow-y-auto bg-white dark:bg-slate-800 rounded-lg shadow-2xl border border-zinc-200 dark:border-slate-600 py-1"
      style={{ top: menuPos.top, left: menuPos.left }}>
      <div className="px-2 py-1.5 border-b border-zinc-100 dark:border-slate-700">
        <p className="text-[10px] font-semibold text-zinc-400 dark:text-slate-500 uppercase tracking-wider">Commandes</p>
      </div>
      {filtered.map((cmd, idx) => (
        <button key={cmd.id} type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            executeCommand(cmd);
          }}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
            idx === selectedIndex ? "bg-indigo-50 dark:bg-indigo-950/40" : "hover:bg-zinc-50 dark:hover:bg-slate-750"
          }`}>
          <span className="w-7 h-7 rounded-md bg-zinc-100 dark:bg-slate-700 flex items-center justify-center text-sm shrink-0">{cmd.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 leading-tight">{cmd.label}</p>
            <p className="text-[10px] text-zinc-400 dark:text-slate-500 leading-tight mt-0.5 truncate">{cmd.description}</p>
          </div>
          {cmd.interactive && (
            <svg className="w-3 h-3 text-zinc-300 dark:text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );

  if (!menuContent) return null;

  return createPortal(menuContent, document.body);
}
