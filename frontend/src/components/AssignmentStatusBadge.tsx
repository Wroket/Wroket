"use client";

import type { AssignmentStatus } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

const STATUS_CLS: Record<AssignmentStatus, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  accepted:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  declined:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const STATUS_KEY = {
  pending: "assign.statusPending",
  accepted: "assign.statusAccepted",
  declined: "assign.statusDeclined",
} as const;

/**
 * Visible assignment status on list/card surfaces (pending / accepted / declined).
 */
export default function AssignmentStatusBadge({
  status,
  className = "",
}: {
  status: AssignmentStatus | null | undefined;
  className?: string;
}) {
  const { t } = useLocale();
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${STATUS_CLS[status]} ${className}`}
    >
      {t(STATUS_KEY[status])}
    </span>
  );
}
