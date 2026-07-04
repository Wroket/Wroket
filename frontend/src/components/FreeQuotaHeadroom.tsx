"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";
import { fillQuotaTemplate } from "@/lib/freeQuota";

/**
 * Compact Free-tier usage chip in the app header (proactive headroom, not only when capped).
 */
export default function FreeQuotaHeadroom() {
  const { user } = useAuth();
  const { t } = useLocale();
  const q = user?.freeQuotas;
  if (!q) return null;

  const segments = [
    fillQuotaTemplate(t("quota.free.headroomTasks"), {
      used: q.activeTasksPersonal,
      max: q.maxActiveTasksPersonal,
    }),
    fillQuotaTemplate(t("quota.free.headroomProjects"), {
      used: q.activeProjectsPersonal,
      max: q.maxProjectsPersonal,
    }),
    fillQuotaTemplate(t("quota.free.headroomNotes"), {
      used: q.notesCount,
      max: q.maxNotes,
    }),
  ];

  const atCap =
    q.activeTasksPersonal >= q.maxActiveTasksPersonal
    || q.activeProjectsPersonal >= q.maxProjectsPersonal
    || q.notesCount >= q.maxNotes;

  return (
    <Link
      href="/pricing"
      title={t("quota.free.headroomTitle")}
      className={`hidden lg:inline-flex items-center max-w-[14rem] xl:max-w-none truncate rounded-md border px-2 py-1 text-[10px] font-medium tabular-nums transition-colors shrink-0 ${
        atCap
          ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
          : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      <span className="truncate">{segments.join(" · ")}</span>
    </Link>
  );
}
