"use client";

import { useMemo, useState, type ReactNode } from "react";
import Menu, { type MenuItem } from "@/components/ui/Menu";
import SlotPicker from "@/components/SlotPicker";
import CommentHoverIcon from "@/components/CommentHoverIcon";
import {
  toolbarAffordanceClass,
  toolbarAffordanceEmpty,
  toolbarCompleteButton,
  toolbarNeutralButton,
} from "@/components/taskToolbarStyles";
import { useLocale } from "@/lib/LocaleContext";
import { getPhaseSlotDateBounds } from "@/lib/phaseSlotBounds";
import type { TaskIconToolbarProps } from "@/components/TaskIconToolbar";
import {
  DEFAULT_VISIBLE_ACTIONS,
  isActionVisible,
  type TaskListActionId,
} from "@/lib/taskListVisibleActions";

type Props = Omit<TaskIconToolbarProps, "variant" | "className" | "isolatePointerEvents"> & {
  /** When true, complete is rendered outside this toolbar (e.g. far-left of the row). */
  hideCompleteButton?: boolean;
  /** Pinned action icons (V2 local preference). */
  visibleActions?: readonly TaskListActionId[];
};

function Icon({ d, strokeWidth = 2 }: { d: string; strokeWidth?: number }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const ICONS = {
  edit: <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />,
  subtask: <Icon d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />,
  note: <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
  meet: <Icon d="M15 10l4.553-2.069A1 1 0 0121 8.862v6.276a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />,
  comments: <Icon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />,
  attach: <Icon d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />,
  accept: <Icon d="M5 13l4 4L19 7" strokeWidth={2.5} />,
  decline: <Icon d="M6 18L18 6M6 6l12 12" />,
  cancel: <Icon d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />,
  delete: <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
} as const satisfies Record<string, ReactNode>;

/**
 * V2 row actions: user-pinned icons + always-on « Plus d'actions » overflow.
 */
export default function TaskRowActionsV2(props: Props) {
  const {
    todo,
    meUid,
    projects,
    commentCount,
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
    onMeet,
    meetLoading,
    hideCompleteButton = false,
    visibleActions = DEFAULT_VISIBLE_ACTIONS,
  } = props;
  const { t } = useLocale();
  const [scheduleOpenSignal, setScheduleOpenSignal] = useState(0);

  const slotBounds = useMemo(() => {
    const { min, max } = getPhaseSlotDateBounds(todo, projects);
    return { dateMin: min, dateMax: max };
  }, [todo, projects]);

  const show = (id: TaskListActionId) => isActionVisible(visibleActions, id);

  const meetBtnClass = toolbarAffordanceClass(!!todo.scheduledSlot?.meetingUrl);
  const commentBtnClass = `relative ${toolbarAffordanceClass(commentCount > 0)}`;
  const noteBtnClass = toolbarAffordanceClass(hasLinkedNote);
  const attachBtnClass = toolbarAffordanceClass(attachmentCount > 0);
  const subtaskBtnClass = toolbarAffordanceEmpty;

  const items: MenuItem[] = [];
  items.push({
    id: "edit",
    label: t("uiV2.editTask"),
    icon: ICONS.edit,
    onSelect: () => onEdit(todo),
  });
  if (!show("subtask") && !todo.parentId) {
    items.push({
      id: "subtask",
      label: t("subtask.add"),
      icon: ICONS.subtask,
      onSelect: () => onSubtask(todo),
    });
  }
  if (!show("note") && onCreateNote) {
    items.push({
      id: "note",
      label: hasLinkedNote ? t("notes.openLinkedNote") : t("notes.createFromTask"),
      icon: ICONS.note,
      onSelect: () => onCreateNote(todo),
    });
  }
  if (!show("meet") && onMeet) {
    items.push({
      id: "meet",
      label: todo.scheduledSlot?.meetingUrl ? t("meet.editMeet") : t("meet.createMeet"),
      icon: ICONS.meet,
      onSelect: () => onMeet(todo),
      disabled: meetLoading,
    });
  }
  if (!show("comment")) {
    items.push({
      id: "comments",
      label: commentCount > 0 ? `${t("comments.title")} (${commentCount})` : t("comments.title"),
      icon: ICONS.comments,
      onSelect: () => onEdit(todo),
    });
  }
  if (!show("attach")) {
    items.push({
      id: "attach",
      label: attachmentCount > 0
        ? `${t("edit.attachments")} (${attachmentCount})`
        : t("edit.attachments"),
      icon: ICONS.attach,
      onSelect: () => onEdit(todo),
    });
  }
  if (!show("schedule") && onScheduleUpdate) {
    items.push({
      id: "schedule",
      label: t("table.visibleAction.schedule"),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      onSelect: () => setScheduleOpenSignal((n) => n + 1),
    });
  }
  if (
    onAccept
    && todo.assignedTo
    && meUid
    && todo.assignedTo === meUid
    && todo.userId !== meUid
    && (todo.assignmentStatus === "declined" || todo.assignmentStatus === "pending")
  ) {
    items.push({
      id: "accept",
      label: t("assign.accept"),
      icon: ICONS.accept,
      onSelect: () => onAccept(todo),
    });
  }
  if (
    onDecline
    && todo.assignedTo
    && meUid
    && todo.assignedTo === meUid
    && todo.userId !== meUid
    && todo.assignmentStatus !== "declined"
  ) {
    items.push({
      id: "decline",
      label: t("assign.decline"),
      icon: ICONS.decline,
      onSelect: () => onDecline(todo),
    });
  }
  if (!show("cancel")) {
    items.push({
      id: "cancel",
      label: t("a11y.cancelTask"),
      icon: ICONS.cancel,
      onSelect: () => onCancel(todo),
      separatorBefore: true,
    });
  }
  if (!show("delete")) {
    items.push({
      id: "delete",
      label: t("a11y.delete"),
      icon: ICONS.delete,
      onSelect: () => onDelete(todo),
      danger: true,
      separatorBefore: show("cancel"),
    });
  }

  return (
    <div
      className="relative inline-flex h-6 w-max max-w-none items-center gap-0.5"
      onClick={(e) => { e.stopPropagation(); }}
    >
      {!hideCompleteButton && (
        <button
          type="button"
          title={t("a11y.complete")}
          aria-label={t("a11y.complete")}
          onClick={() => onComplete(todo)}
          className={toolbarCompleteButton}
        >
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
      {onScheduleUpdate && (
        <span
          className={
            show("schedule")
              ? "inline-flex h-6 w-6 shrink-0 items-center justify-center"
              : "sr-only"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <SlotPicker
            todoId={todo.id}
            scheduledSlot={todo.scheduledSlot}
            suggestedSlot={suggestedSlot}
            onBooked={onScheduleUpdate}
            onCleared={onScheduleUpdate}
            autoOpen={show("schedule") && todo.id === justCreatedId}
            openSignal={scheduleOpenSignal}
            dateMin={slotBounds.dateMin}
            dateMax={slotBounds.dateMax}
          />
        </span>
      )}
      {show("meet") && onMeet && (
        <button
          type="button"
          onClick={() => onMeet(todo)}
          title={todo.scheduledSlot?.meetingUrl ? t("meet.editMeet") : t("meet.createMeet")}
          aria-label={todo.scheduledSlot?.meetingUrl ? t("meet.editMeet") : t("meet.createMeet")}
          disabled={meetLoading}
          className={`${meetBtnClass} ${meetLoading ? "opacity-90 cursor-wait" : ""}`}
        >
          {meetLoading ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20 10 10 0 000-20v4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.862v6.276a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      )}
      {show("comment") && (
        <CommentHoverIcon
          todoId={todo.id}
          commentCount={commentCount}
          onClick={() => onEdit(todo)}
          buttonClass={commentBtnClass}
          iconSize="w-3 h-3"
        />
      )}
      {show("note") && onCreateNote && (
        <button
          type="button"
          onClick={() => onCreateNote(todo)}
          title={hasLinkedNote ? t("notes.openLinkedNote") : t("notes.createFromTask")}
          aria-label={hasLinkedNote ? t("notes.openLinkedNote") : t("notes.createFromTask")}
          className={noteBtnClass}
        >
          <svg className="w-3 h-3" fill={hasLinkedNote ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>
      )}
      {show("subtask") && !todo.parentId && (
        <button
          type="button"
          onClick={() => onSubtask(todo)}
          title={t("subtask.add")}
          aria-label={t("subtask.add")}
          className={subtaskBtnClass}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 5.25h16.5m-16.5-10.5H12" />
          </svg>
        </button>
      )}
      {show("attach") && (
        <button
          type="button"
          onClick={() => onEdit(todo)}
          title={t("a11y.taskAttachments")}
          aria-label={t("a11y.taskAttachments")}
          className={attachBtnClass}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
      )}
      {show("cancel") && (
        <button
          type="button"
          onClick={() => onCancel(todo)}
          title={t("a11y.cancelTask")}
          aria-label={t("a11y.cancelTask")}
          className={toolbarNeutralButton}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
      )}
      {show("delete") && (
        <button
          type="button"
          onClick={() => onDelete(todo)}
          title={t("a11y.deleteTask")}
          aria-label={t("a11y.deleteTask")}
          className={toolbarNeutralButton}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
      <Menu
        items={items}
        align="left"
        label={t("uiV2.taskActions")}
        trigger={
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
        }
        triggerProps={{
          title: t("uiV2.taskActions"),
          className: toolbarAffordanceEmpty,
        }}
      />
    </div>
  );
}
