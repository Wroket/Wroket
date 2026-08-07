"use client";

import { FormEvent, useState } from "react";
import type { Effort, Priority } from "@/lib/api/todos";
import { createTodo } from "@/lib/api/todos";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import { formatUserFacingError } from "@/lib/apiErrors";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

export interface QuickCreateTaskValues {
  title: string;
  priority: Priority;
  effort: Effort;
  deadline: string;
  projectId: string;
  /** Optional ISO start for agenda slot booking (caller handles booking). */
  startDate?: string;
}

interface QuickCreateTaskProps {
  /** Prefill / lock project when creating from a project page */
  defaultProjectId?: string | null;
  /** Prefill deadline YYYY-MM-DD */
  defaultDeadline?: string;
  /** Prefill start date YYYY-MM-DD */
  defaultStartDate?: string;
  /** Called after successful API create (with server todo id) */
  onCreated?: (todoId: string, values: QuickCreateTaskValues) => void;
  /** Compact inline mode (no card chrome) */
  variant?: "inline" | "panel";
  /** Hide project field */
  hideProject?: boolean;
  projects?: { id: string; name: string }[];
  autoFocus?: boolean;
  /** Submit button label override */
  submitLabel?: string;
}

/**
 * Title-first task create with progressive disclosure of optional fields.
 */
export default function QuickCreateTask({
  defaultProjectId = null,
  defaultDeadline = "",
  defaultStartDate = "",
  onCreated,
  variant = "panel",
  hideProject = false,
  projects = [],
  autoFocus = true,
  submitLabel,
}: QuickCreateTaskProps) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [effort, setEffort] = useState<Effort>("medium");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [startDate] = useState(defaultStartDate);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const values: QuickCreateTaskValues = {
        title: trimmed,
        priority,
        effort,
        deadline,
        projectId,
        startDate: startDate || undefined,
      };
      const todo = await createTodo({
        title: trimmed,
        priority,
        effort,
        deadline: deadline || null,
        startDate: startDate || null,
        projectId: projectId || null,
      });
      setTitle("");
      setMore(false);
      onCreated?.(todo.id, values);
      toast.success(t("uiV2.taskCreated"));
    } catch (err) {
      toast.error(formatUserFacingError(err, "toast.createError"));
    } finally {
      setSaving(false);
    }
  };

  const form = (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("todos.addPlaceholder")}
          autoFocus={autoFocus}
          aria-label={t("todos.titleLabel")}
          className="flex-1"
        />
        <Button type="submit" size="md" disabled={saving || !title.trim()}>
          {saving ? t("todos.adding") : (submitLabel ?? t("todos.add"))}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {more ? t("uiV2.lessOptions") : t("uiV2.moreOptions")}
        </button>
      </div>
      {more && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 ui-v2-fade">
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-slate-400 mb-0.5">
              {t("todos.importanceLabel")}
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="high">{t("priority.high")}</option>
              <option value="medium">{t("priority.medium")}</option>
              <option value="low">{t("priority.low")}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-slate-400 mb-0.5">
              {t("todos.effortLabel")}
            </label>
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as Effort)}
              className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="light">{t("effort.light")}</option>
              <option value="medium">{t("effort.medium")}</option>
              <option value="heavy">{t("effort.heavy")}</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-zinc-500 dark:text-slate-400 mb-0.5">
              {t("todos.deadlineLabel")}
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          {!hideProject && (
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 dark:text-slate-400 mb-0.5">
                {t("nav.projects")}
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-slate-600 px-2 py-1.5 text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">{t("projects.personal")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </form>
  );

  if (variant === "inline") return form;

  return (
    <div className="rounded-sm border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      {form}
    </div>
  );
}
