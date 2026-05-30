"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SYSTEM_TEMPLATES,
  getTemplates,
  createTemplate,
  deleteTemplate,
  type TaskTemplate,
  type CreateTemplateInput,
} from "@/lib/api/templates";
import { EFFORT_BADGES } from "@/lib/effortBadges";
import { PRIORITY_BADGES } from "@/lib/todoConstants";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import type { Priority, Effort } from "@/lib/api";

export interface TemplateApplyPayload {
  priority: Priority;
  effort: Effort;
  estimatedMinutes: number | null;
  tags: string[];
  subtasks: string[];
}

interface Props {
  onApply: (payload: TemplateApplyPayload) => void;
}

type Tab = "system" | "custom";

const PRIORITIES: Priority[] = ["high", "medium", "low"];
const EFFORTS: Effort[] = ["light", "medium", "heavy"];

export default function TaskTemplatePicker({ onApply }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("system");
  const [customTemplates, setCustomTemplates] = useState<TaskTemplate[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState<CreateTemplateInput>({
    name: "",
    emoji: "📋",
    description: "",
    priority: "medium",
    effort: "medium",
    estimatedMinutes: null,
    tags: [],
    subtasks: [],
  });
  const [newTagInput, setNewTagInput] = useState("");
  const [newSubtaskInput, setNewSubtaskInput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const loadCustom = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const list = await getTemplates();
      setCustomTemplates(list);
    } catch {
      toast.error(t("template.loadError"));
    } finally {
      setLoadingCustom(false);
    }
  }, [toast, t]);

  useEffect(() => {
    if (open && tab === "custom") {
      void loadCustom();
    }
  }, [open, tab, loadCustom]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClickOut(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOut);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOut);
    };
  }, [open]);

  function applySystem(tpl: (typeof SYSTEM_TEMPLATES)[number]) {
    onApply({
      priority: tpl.priority,
      effort: tpl.effort,
      estimatedMinutes: tpl.estimatedMinutes,
      tags: tpl.tags,
      subtasks: tpl.subtasks,
    });
    setOpen(false);
  }

  function applyCustom(tpl: TaskTemplate) {
    onApply({
      priority: tpl.priority,
      effort: tpl.effort,
      estimatedMinutes: tpl.estimatedMinutes,
      tags: tpl.tags,
      subtasks: tpl.subtasks,
    });
    setOpen(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await createTemplate(newForm);
      setCustomTemplates((prev) => [created, ...prev]);
      setNewForm({
        name: "",
        emoji: "📋",
        description: "",
        priority: "medium",
        effort: "medium",
        estimatedMinutes: null,
        tags: [],
        subtasks: [],
      });
      setNewTagInput("");
      setNewSubtaskInput("");
      toast.success(t("template.created"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("template.createError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTemplate(id);
      setCustomTemplates((prev) => prev.filter((tpl) => tpl.id !== id));
      toast.success(t("template.deleted"));
    } catch {
      toast.error(t("template.deleteError"));
    }
  }

  function addTag() {
    const tag = newTagInput.trim();
    if (!tag || (newForm.tags ?? []).includes(tag)) return;
    setNewForm((f) => ({ ...f, tags: [...(f.tags ?? []), tag] }));
    setNewTagInput("");
  }

  function addSubtask() {
    const s = newSubtaskInput.trim();
    if (!s) return;
    setNewForm((f) => ({ ...f, subtasks: [...(f.subtasks ?? []), s] }));
    setNewSubtaskInput("");
  }

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={t("template.pickerTitle")}
        className="flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-800 dark:hover:text-slate-200 transition-colors border border-zinc-200 dark:border-slate-700"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {t("template.button")}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 rounded-md shadow-lg overflow-hidden"
        >
          {/* Tabs */}
          <div className="flex border-b border-zinc-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setTab("system")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "system"
                  ? "text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800 border-b-2 border-indigo-500"
                  : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-300"
              }`}
            >
              📚 {t("template.tabSystem")}
            </button>
            <button
              type="button"
              onClick={() => setTab("custom")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "custom"
                  ? "text-zinc-900 dark:text-slate-100 bg-zinc-50 dark:bg-slate-800 border-b-2 border-indigo-500"
                  : "text-zinc-500 dark:text-slate-400 hover:text-zinc-700 dark:hover:text-slate-300"
              }`}
            >
              ⭐ {t("template.tabCustom")}
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-3">
            {tab === "system" && (
              <ul className="space-y-1.5">
                {SYSTEM_TEMPLATES.map((tpl, idx) => (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => applySystem(tpl)}
                      className="w-full text-left rounded-md px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors group"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg shrink-0 mt-0.5">{tpl.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-800 dark:text-slate-200">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-[11px] text-zinc-500 dark:text-slate-400 mt-0.5 line-clamp-1">{tpl.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGES[tpl.priority].cls}`}>
                              {PRIORITY_BADGES[tpl.priority].label}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium ${EFFORT_BADGES[tpl.effort].cls}`}>
                              {EFFORT_BADGES[tpl.effort].label}
                            </span>
                            {tpl.subtasks.length > 0 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 text-zinc-600 dark:bg-slate-800 dark:text-slate-300">
                                {tpl.subtasks.length} {t("template.subtasks")}
                              </span>
                            )}
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-indigo-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {tab === "custom" && (
              <div className="space-y-4">
                {loadingCustom ? (
                  <p className="text-xs text-zinc-400 dark:text-slate-500 text-center py-3">{t("loading")}</p>
                ) : customTemplates.length === 0 ? (
                  <p className="text-xs text-zinc-400 dark:text-slate-500 text-center py-3">{t("template.noCustom")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {customTemplates.map((tpl) => (
                      <li key={tpl.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyCustom(tpl)}
                          className="flex-1 min-w-0 text-left rounded-md px-3 py-2 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">{tpl.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-800 dark:text-slate-200 truncate">{tpl.name}</p>
                              <div className="flex gap-1 mt-0.5">
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_BADGES[tpl.priority].cls}`}>
                                  {PRIORITY_BADGES[tpl.priority].label}
                                </span>
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium ${EFFORT_BADGES[tpl.effort].cls}`}>
                                  {EFFORT_BADGES[tpl.effort].label}
                                </span>
                                {tpl.subtasks.length > 0 && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-zinc-100 text-zinc-600 dark:bg-slate-800 dark:text-slate-300">
                                    {tpl.subtasks.length} {t("template.subtasks")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(tpl.id)}
                          className="shrink-0 p-1 text-zinc-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                          title={t("template.delete")}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Create new template form */}
                <form onSubmit={(e) => void handleCreate(e)} className="border-t border-zinc-200 dark:border-slate-700 pt-3 space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wide">
                    {t("template.createNew")}
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newForm.emoji}
                      onChange={(e) => setNewForm((f) => ({ ...f, emoji: e.target.value }))}
                      className="w-10 text-center rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-1 py-1"
                      maxLength={2}
                    />
                    <input
                      type="text"
                      value={newForm.name}
                      onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder={t("template.namePlaceholder")}
                      className="flex-1 rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm px-2 py-1 text-zinc-900 dark:text-slate-100"
                      maxLength={100}
                      required
                    />
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={newForm.priority}
                      onChange={(e) => setNewForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                      className="flex-1 rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 py-1 text-zinc-700 dark:text-slate-300"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{PRIORITY_BADGES[p].label}</option>
                      ))}
                    </select>
                    <select
                      value={newForm.effort}
                      onChange={(e) => setNewForm((f) => ({ ...f, effort: e.target.value as Effort }))}
                      className="flex-1 rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 py-1 text-zinc-700 dark:text-slate-300"
                    >
                      {EFFORTS.map((ef) => (
                        <option key={ef} value={ef}>{EFFORT_BADGES[ef].label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tags */}
                  <div className="flex gap-1 items-center flex-wrap">
                    {(newForm.tags ?? []).map((tag) => (
                      <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full bg-zinc-100 dark:bg-slate-800 text-zinc-600 dark:text-slate-300">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setNewForm((f) => ({ ...f, tags: (f.tags ?? []).filter((tt) => tt !== tag) }))}
                          className="hover:text-red-500"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder={t("template.addTag")}
                      className="flex-1 min-w-[80px] rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 py-1 text-zinc-700 dark:text-slate-300"
                    />
                  </div>

                  {/* Subtasks */}
                  <div className="space-y-1">
                    {(newForm.subtasks ?? []).map((s, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="flex-1 text-xs text-zinc-700 dark:text-slate-300 truncate">{s}</span>
                        <button
                          type="button"
                          onClick={() => setNewForm((f) => ({ ...f, subtasks: (f.subtasks ?? []).filter((_, j) => j !== i) }))}
                          className="text-zinc-400 hover:text-red-500 text-sm leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <input
                      type="text"
                      value={newSubtaskInput}
                      onChange={(e) => setNewSubtaskInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                      placeholder={t("template.addSubtask")}
                      className="w-full rounded border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2 py-1 text-zinc-700 dark:text-slate-300"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={creating || !newForm.name?.trim()}
                    className="w-full rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 transition-colors"
                  >
                    {creating ? t("template.creating") : t("template.createBtn")}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
