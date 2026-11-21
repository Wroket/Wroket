"use client";

import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import type { TaskEditZone } from "./types";

export interface TaskEditZoneTabsProps {
  editZone: TaskEditZone;
  onEditZoneChange: (zone: TaskEditZone) => void;
  /** Hide Meet when the parent cannot create/edit meetings. */
  showMeet?: boolean;
}

const TAB_DEFS: Array<{ zone: TaskEditZone; key: TranslationKey; meetOnly?: boolean }> = [
  { zone: "essentials", key: "uiV2.essentials" },
  { zone: "schedule", key: "uiV2.schedule" },
  { zone: "planning", key: "uiV2.planning" },
  { zone: "meet", key: "uiV2.meet", meetOnly: true },
  { zone: "collab", key: "uiV2.collaboration" },
  { zone: "advanced", key: "uiV2.advanced" },
];

export default function TaskEditZoneTabs({
  editZone,
  onEditZoneChange,
  showMeet = true,
}: TaskEditZoneTabsProps) {
  const { t } = useLocale();

  return (
    <div className="shrink-0 flex flex-wrap gap-1 mb-4 p-1 rounded-sm bg-zinc-100/95 dark:bg-slate-800/95 border border-transparent">
      {TAB_DEFS.filter((tab) => showMeet || !tab.meetOnly).map(({ zone, key }) => (
        <button
          key={zone}
          type="button"
          onClick={() => onEditZoneChange(zone)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            editZone === zone
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
