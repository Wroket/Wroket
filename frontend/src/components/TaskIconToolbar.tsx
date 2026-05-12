"use client";

import { useMemo } from "react";

import CommentHoverIcon from "@/components/CommentHoverIcon";
import SlotPicker from "@/components/SlotPicker";
import {
  toolbarAffordanceClass,
  toolbarNeutralButton,
} from "@/components/taskToolbarStyles";
import { useLocale } from "@/lib/LocaleContext";
import type { Project, Todo } from "@/lib/api";

export interface TaskIconToolbarProps {
  todo: Todo;
  meUid: string | null;
  projects: Project[];
  commentCount: number;
  /** Nombre de sous-tâches (pour contour sous-tâche bleu / vert). */
  subtaskCount?: number;
  /** Nombre de pièces jointes sur la tâche (pour contour PJ). */
  attachmentCount?: number;
  onComplete: (t: Todo) => void;
  onSubtask: (t: Todo) => void;
  onCancel: (t: Todo) => void;
  onEdit: (t: Todo) => void;
  onDelete: (t: Todo) => void;
  onScheduleUpdate?: (t: Todo) => void;
  onDecline?: (t: Todo) => void;
  onAccept?: (t: Todo) => void;
  onCreateNote?: (t: Todo) => void;
  hasLinkedNote?: boolean;
  justCreatedId?: string | null;
  /** Passe à SlotPicker (vue cartes / détails). */
  suggestedSlot?: Todo["suggestedSlot"];
  /**
   * Cartes, liste et radar : évite que les clics sur la barre d’actions remontent au conteneur (ouverture édition au clic).
   */
  isolatePointerEvents?: boolean;
  className?: string;
  /** Vue radar : grille 4×2 (4 icônes par ligne) à droite. */
  variant?: "default" | "radar";
  /** Create / join a Google Meet for this task. */
  onMeet?: (t: Todo) => void;
  /** Currently creating a Meet (spinner). */
  meetLoading?: boolean;
}

/**
 * Barre d’actions alignée sur la vue Liste : coches / sous-tâche / agenda / annuler, puis commentaire, pièces jointes, note, corbeille.
 */
export default function TaskIconToolbar({
  todo,
  meUid,
  projects,
  commentCount,
  subtaskCount = 0,
  attachmentCount = 0,
  onComplete,
  onSubtask,
  onCancel,
  onEdit,
  onDelete,
  onScheduleUpdate,
  onDecline,
  onAccept,
  onCreateNote,
  hasLinkedNote = false,
  justCreatedId,
  suggestedSlot,
  isolatePointerEvents = false,
  className = "",
  variant = "default",
  onMeet,
  meetLoading = false,
}: TaskIconToolbarProps) {
  const { t } = useLocale();

  const slotBounds = useMemo(() => {
    let dateMin: string | undefined;
    let dateMax: string | undefined;
    if (todo.phaseId) {
      for (const proj of projects) {
        const ph = proj.phases?.find((p) => p.id === todo.phaseId);
        if (ph) {
          dateMin = ph.startDate ?? undefined;
          dateMax = ph.endDate ?? undefined;
          break;
        }
      }
    }
    return { dateMin, dateMax };
  }, [todo.phaseId, projects]);

  const wrap = (fn: () => void) => (e: React.MouseEvent) => {
    if (isolatePointerEvents) {
      e.stopPropagation();
      e.preventDefault();
    }
    fn();
  };

  const commentBtnClass = `relative ${toolbarAffordanceClass(commentCount > 0)}`;
  const subtaskBtnClass = toolbarAffordanceClass(subtaskCount > 0);
  const attachBtnClass = toolbarAffordanceClass(attachmentCount > 0);
  const noteBtnClass = toolbarAffordanceClass(hasLinkedNote);
  const meetBtnClass = toolbarAffordanceClass(!!todo.scheduledSlot?.meetingUrl);

  const layoutCls =
    variant === "radar"
      ? "grid grid-cols-4 gap-x-1 gap-y-1 w-[6.75rem] shrink-0 justify-items-center content-start"
      : "flex items-center gap-1 shrink-0";

  return (
    <div
      className={`${layoutCls} ${className}`}
      onClick={isolatePointerEvents ? (e) => e.stopPropagation() : undefined}
    >
      <button
        type="button"
        onClick={wrap(() => onComplete(todo))}
        aria-label={t("a11y.complete")}
        title={t("a11y.complete")}
        className={toolbarNeutralButton}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>
      {!todo.parentId && (
        <button
          type="button"
          onClick={wrap(() => onSubtask(todo))}
          className={subtaskBtnClass}
          title={t("subtask.add")}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
      {onScheduleUpdate && (
        <span onClick={isolatePointerEvents ? (e) => e.stopPropagation() : undefined}>
          <SlotPicker
            todoId={todo.id}
            scheduledSlot={todo.scheduledSlot}
            suggestedSlot={suggestedSlot}
            onBooked={onScheduleUpdate}
            onCleared={onScheduleUpdate}
            autoOpen={todo.id === justCreatedId}
            dateMin={slotBounds.dateMin}
            dateMax={slotBounds.dateMax}
          />
        </span>
      )}
      <button
        type="button"
        onClick={wrap(() => onCancel(todo))}
        aria-label={t("a11y.cancelTask")}
        title={t("a11y.cancelTask")}
        className={toolbarNeutralButton}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </button>
      {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && todo.assignmentStatus !== "declined" && onDecline && (
        <button
          type="button"
          onClick={wrap(() => onDecline(todo))}
          title={t("assign.decline")}
          className={toolbarNeutralButton}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {todo.assignedTo && meUid && todo.assignedTo === meUid && todo.userId !== meUid && (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending") && onAccept && (
        <button
          type="button"
          onClick={wrap(() => onAccept(todo))}
          title={t("assign.accept")}
          className={toolbarNeutralButton}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
      <CommentHoverIcon
        todoId={todo.id}
        commentCount={commentCount}
        onClick={() => onEdit(todo)}
        buttonClass={commentBtnClass}
        iconSize="w-3 h-3"
      />
      <button
        type="button"
        onClick={wrap(() => onEdit(todo))}
        title={t("a11y.taskAttachments")}
        aria-label={t("a11y.taskAttachments")}
        className={attachBtnClass}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </button>
      {onCreateNote && (
        <button
          type="button"
          onClick={wrap(() => onCreateNote(todo))}
          title={hasLinkedNote ? t("notes.openLinkedNote") : t("notes.createFromTask")}
          className={noteBtnClass}
        >
          <svg className="w-3 h-3" fill={hasLinkedNote ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
      {onMeet && (
        <button
          type="button"
          onClick={wrap(() => onMeet(todo))}
          title={todo.scheduledSlot?.meetingUrl ? t("meet.editMeet") : t("meet.createMeet")}
          disabled={meetLoading}
          className={`${meetBtnClass} ${meetLoading ? "opacity-90 cursor-wait" : ""}`}
        >
          {meetLoading ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20 10 10 0 000-20v4z" /></svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.862v6.276a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={wrap(() => onDelete(todo))}
        aria-label={t("a11y.deleteTask")}
        title={t("a11y.deleteTask")}
        className={toolbarNeutralButton}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
