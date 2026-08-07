"use client";

import { useLocale } from "@/lib/LocaleContext";
import type { TaskEditZone } from "./types";

export interface TaskEditZoneTabsProps {
  editZone: TaskEditZone;
  onEditZoneChange: (zone: TaskEditZone) => void;
}

export default function TaskEditZoneTabs({ editZone, onEditZoneChange }: TaskEditZoneTabsProps) {
  const { t } = useLocale();

  return (
    <div className="shrink-0 flex flex-wrap gap-1 mb-4 p-1 rounded-sm bg-zinc-100/95 dark:bg-slate-800/95 border border-transparent">
      {(
        [
          ["essentials", "uiV2.essentials"],
          ["planning", "uiV2.planning"],
          ["collab", "uiV2.collaboration"],
          ["advanced", "uiV2.advanced"],
        ] as const
      ).map(([z, key]) => (
        <button
          key={z}
          type="button"
          onClick={() => onEditZoneChange(z)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            editZone === z
              ? "bg-white dark:bg-slate-700 text-zinc-900 dark:text-slate-100 shadow-sm"
              : "text-zinc-500 dark:text-slate-400 hover:text-zinc-800 dark:hover:text-slate-200"
          }`}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}
