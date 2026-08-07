"use client";

import ContactEmailSuggestInput from "@/components/ContactEmailSuggestInput";
import { useLocale } from "@/lib/LocaleContext";
import type { Todo, AuthMeResponse } from "@/lib/api";
import type { TaskEditModalProps } from "./types";

export interface TaskEditCollabZoneProps {
  className: string;
  todo: Todo;
  form: TaskEditModalProps["form"];
  isTaskOwner: boolean;
  assignEmail: string;
  onAssignEmailChange: (email: string) => void;
  assignedUser: AuthMeResponse | null;
  assignError: string | null;
  onClearAssign: () => void;
  userDisplayName: (uid: string) => string;
  currentUserUid?: string;
  onAcceptDecline?: (status: "accepted" | "declined") => void;
}

export default function TaskEditCollabZone({
  className,
  todo,
  form,
  isTaskOwner,
  assignEmail,
  onAssignEmailChange,
  assignedUser,
  assignError,
  onClearAssign,
  userDisplayName,
  currentUserUid,
  onAcceptDecline,
}: TaskEditCollabZoneProps) {
  const { t } = useLocale();

  return (
    <div id="zone-collab" className={className}>
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1">
          {t("assign.label")}
        </label>
        {isTaskOwner ? (
          <div>
            <ContactEmailSuggestInput
              value={assignEmail}
              onChange={onAssignEmailChange}
              placeholder={t("assign.placeholder")}
              inputClassName={`w-full rounded border px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 ${
                assignedUser
                  ? "border-green-400 dark:border-green-600 focus:border-green-500 focus:ring-green-500"
                  : assignError
                    ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500"
                    : "border-zinc-300 dark:border-slate-600 focus:border-slate-700 dark:focus:border-slate-400 focus:ring-slate-700 dark:focus:ring-slate-400"
              }`}
              rightAdornment={
                assignedUser ? (
                  <span className="text-green-500">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : undefined
              }
            />
            {form.assignedTo && !assignEmail && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-zinc-500 dark:text-slate-400">
                  {t("assign.label")}: {userDisplayName(form.assignedTo)}
                </span>
                <button
                  type="button"
                  onClick={onClearAssign}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            )}
            {assignError && (
              <p className="text-[10px] text-red-500 mt-0.5">{assignError}</p>
            )}
          </div>
        ) : (
          <div>
            {form.assignedTo ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-800/60 px-3 py-2">
                  <svg className="w-4 h-4 text-zinc-400 dark:text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm text-zinc-700 dark:text-slate-300">{userDisplayName(form.assignedTo)}</span>
                  {todo?.assignmentStatus && (
                    <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      todo.assignmentStatus === "accepted"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : todo.assignmentStatus === "declined"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}>
                      {todo.assignmentStatus === "accepted" ? t("assign.statusAccepted")
                        : todo.assignmentStatus === "declined" ? t("assign.statusDeclined")
                          : t("assign.statusPending")}
                    </span>
                  )}
                </div>
                {onAcceptDecline && currentUserUid && form.assignedTo === currentUserUid && todo?.userId !== currentUserUid && todo?.assignmentStatus !== "accepted" && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onAcceptDecline("accepted")}
                      className="flex-1 rounded border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                    >
                      {t("assign.accept")}
                    </button>
                    {todo?.assignmentStatus !== "declined" && (
                      <button
                        type="button"
                        onClick={() => onAcceptDecline("declined")}
                        className="flex-1 rounded border border-red-300 dark:border-red-700 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      >
                        {t("assign.decline")}
                      </button>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-zinc-400 dark:text-slate-500">{t("assign.ownerOnly")}</p>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-slate-500 italic">{t("assign.unassigned")}</p>
            )}
          </div>
        )}
    </div>
  );
}
