"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { useLocale } from "@/lib/LocaleContext";
import type { TranslationKey } from "@/lib/i18n";
import { fillQuotaTemplate } from "@/lib/freeQuota";

export default function FreeQuotaBanner() {
  const { user } = useAuth();
  const { t } = useLocale();
  const q = user?.freeQuotas;
  if (!q) return null;

  const lines: { key: TranslationKey; vars: Record<string, string | number> }[] = [];
  if (q.activeTasksPersonal >= q.maxActiveTasksPersonal) {
    lines.push({
      key: "quota.free.lineTasks",
      vars: { used: q.activeTasksPersonal, max: q.maxActiveTasksPersonal },
    });
  }
  if (q.activeProjectsPersonal >= q.maxProjectsPersonal) {
    lines.push({
      key: "quota.free.lineProjects",
      vars: { used: q.activeProjectsPersonal, max: q.maxProjectsPersonal },
    });
  }
  if (q.notesCount >= q.maxNotes) {
    lines.push({
      key: "quota.free.lineNotes",
      vars: { used: q.notesCount, max: q.maxNotes },
    });
  }
  if (lines.length === 0) return null;

  return (
    <div
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
      role="status"
    >
      <p className="font-medium">{t("quota.free.bannerTitle")}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {lines.map((line) => (
          <li key={line.key}>{fillQuotaTemplate(t(line.key), line.vars)}</li>
        ))}
      </ul>
      <p className="mt-2">
        <Link href="/pricing" className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950 dark:text-amber-200 dark:hover:text-amber-50">
          {t("quota.free.upgradeLink")}
        </Link>
      </p>
    </div>
  );
}
