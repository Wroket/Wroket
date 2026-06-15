"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import {
  createProjectMilestone,
  deleteProjectMilestone,
  type ProjectMilestone,
  type ProjectPhase,
} from "@/lib/api/projects";

interface Props {
  projectId: string;
  phases: ProjectPhase[];
  milestones: ProjectMilestone[];
  canEdit: boolean;
  onChange: () => void;
}

export default function ProjectMilestonesPanel({
  projectId,
  phases,
  milestones,
  canEdit,
  onChange,
}: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [phaseId, setPhaseId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const sorted = [...milestones].sort((a, b) => a.order - b.order);

  const handleAdd = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    try {
      await createProjectMilestone(projectId, {
        title: title.trim(),
        date,
        phaseId: phaseId || null,
      });
      setTitle("");
      setDate("");
      setPhaseId("");
      onChange();
      toast.success(t("projects.milestoneAdded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("projects.milestoneError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProjectMilestone(projectId, id);
      onChange();
      toast.success(t("projects.milestoneDeleted"));
    } catch {
      toast.error(t("projects.milestoneError"));
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider mb-3">
        {t("projects.milestonesTitle")}
      </h4>
      {sorted.length === 0 && !canEdit && (
        <p className="text-xs text-zinc-500 dark:text-slate-400">{t("projects.milestonesEmpty")}</p>
      )}
      {sorted.length > 0 && (
        <ul className="space-y-2 mb-3">
          {sorted.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                <span className="truncate text-zinc-800 dark:text-slate-200">{m.title}</span>
                <span className="text-xs text-zinc-500 dark:text-slate-400 shrink-0">{m.date}</span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDelete(m.id)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0"
                >
                  {t("projects.delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("projects.milestoneTitlePlaceholder")}
            className="flex-1 min-w-[120px] rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          />
          <select
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value)}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          >
            <option value="">{t("projects.milestoneNoPhase")}</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving || !title.trim() || !date}
            className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "…" : t("projects.milestoneAdd")}
          </button>
        </div>
      )}
    </div>
  );
}
