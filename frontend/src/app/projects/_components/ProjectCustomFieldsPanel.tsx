"use client";

import { useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import {
  createProjectCustomFieldDef,
  deleteProjectCustomFieldDef,
  type CustomFieldType,
  type ProjectCustomFieldDef,
} from "@/lib/api/projects";

interface Props {
  projectId: string;
  fields: ProjectCustomFieldDef[];
  canEdit: boolean;
  canUse: boolean;
  onChange: () => void;
}

const FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "select", "checkbox"];

export default function ProjectCustomFieldsPanel({
  projectId,
  fields,
  canEdit,
  canUse,
  onChange,
}: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);

  if (!canUse) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <p className="text-xs text-zinc-500 dark:text-slate-400">{t("projects.customFieldsPlanRequired")}</p>
      </div>
    );
  }

  const sorted = [...fields].sort((a, b) => a.order - b.order);

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createProjectCustomFieldDef(projectId, {
        name: name.trim(),
        type,
        options: type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      });
      setName("");
      setOptions("");
      onChange();
      toast.success(t("projects.customFieldAdded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("projects.customFieldError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fieldId: string) => {
    try {
      await deleteProjectCustomFieldDef(projectId, fieldId);
      onChange();
      toast.success(t("projects.customFieldDeleted"));
    } catch {
      toast.error(t("projects.customFieldError"));
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h4 className="text-xs font-semibold text-zinc-500 dark:text-slate-400 uppercase tracking-wider mb-3">
        {t("projects.customFieldsTitle")}
      </h4>
      {sorted.length > 0 && (
        <ul className="space-y-1 mb-3">
          {sorted.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-800 dark:text-slate-200">
                {f.name}
                <span className="ml-2 text-xs text-zinc-500">({t(`projects.customFieldType.${f.type}`)})</span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDelete(f.id)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projects.customFieldNamePlaceholder")}
            className="flex-1 min-w-[100px] rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          >
            {FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>{t(`projects.customFieldType.${ft}`)}</option>
            ))}
          </select>
          {type === "select" && (
            <input
              type="text"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={t("projects.customFieldOptionsPlaceholder")}
              className="flex-1 min-w-[140px] rounded border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
            />
          )}
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving || !name.trim()}
            className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "…" : t("projects.customFieldAdd")}
          </button>
        </div>
      )}
    </div>
  );
}
