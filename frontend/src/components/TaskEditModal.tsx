"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useModalCloseKeys } from "@/lib/useModalCloseKeys";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getComments,
  postCommentApi,
  deleteCommentApi,
  editCommentApi,
  toggleReactionApi,
  getCollaborators,
  inviteCollaborator,
  getAttachments,
  uploadAttachment,
  deleteAttachmentApi,
  syncOneScheduledSlotToCalendar,
} from "@/lib/api";
import { broadcastResourceChange } from "@/lib/useResourceSync";
import type {
  Comment,
  Collaborator,
  Attachment,
  Project,
} from "@/lib/api";
import {
  getTodoTimeSessions,
  startTodoTimer,
  stopTodoTimer,
  addManualTodoTimeSession,
  type TimeSession,
} from "@/lib/api/timeSessions";
import { updateTodo } from "@/lib/api";
import { useUiV2 } from "@/lib/UiVersionContext";
import TaskEditZoneTabs from "@/components/taskEdit/TaskEditZoneTabs";
import TaskEditEssentialsZone from "@/components/taskEdit/TaskEditEssentialsZone";
import TaskEditPlanningZone from "@/components/taskEdit/TaskEditPlanningZone";
import TaskEditCollabZone from "@/components/taskEdit/TaskEditCollabZone";
import TaskEditAdvancedZone from "@/components/taskEdit/TaskEditAdvancedZone";
import type { TaskEditZone, TaskEditModalProps } from "@/components/taskEdit/types";

export type { TaskEditZone, TaskEditModalProps } from "@/components/taskEdit/types";

export default function TaskEditModal({
  todo,
  form,
  onFormChange,
  onClose,
  initialZone = "essentials",
  openNonce = 0,
  saving,
  assignEmail,
  onAssignEmailChange,
  assignedUser,
  assignError,
  onAssignLookup: _onAssignLookup,
  onClearAssign,
  userDisplayName,
  onOpenSubtasks,
  subtaskCount = 0,
  effortDefaults,
  currentUserUid,
  projects = [],
  isTaskOwner = true,
  onAcceptDecline,
  onSuggestedSlotChange,
  onPersistTags,
  onTodoCommentsChanged,
  viewOnly = false,
  onManageMeet,
  freeTierContentLocks = false,
  canSyncToCalendar = false,
  onExternalSlotSynced,
  onRequestDeleteTask,
  projectTasks = [],
  canUseDependencies = false,
  customFieldDefs = [],
  canUseCustomFields = false,
  canUseTimeTracking = false,
  onTodoUpdated,
}: TaskEditModalProps) {
  void _onAssignLookup;
  const { t } = useLocale();
  const { uiV2 } = useUiV2();
  const { toast } = useToast();
  const trapRef = useFocusTrap(!!todo);
  useModalCloseKeys(!!todo, onClose);
  const [editZone, setEditZone] = useState<TaskEditZone>(initialZone);

  /**
   * V2: inactive zones are removed from flow (`hidden`); the zone host keeps a fixed height
   * so tab switches do not resize the dialog.
   */
  const zoneCls = (zone: TaskEditZone, base = "space-y-3") =>
    uiV2
      ? `${base}${editZone !== zone ? " hidden" : " h-full"}`
      : base;

  const sortedProjectOptions = useMemo(() => {
    const roots = projects.filter((p) => !p.parentProjectId);
    const childrenMap = new Map<string, Project[]>();
    for (const p of projects) {
      if (p.parentProjectId) {
        const list = childrenMap.get(p.parentProjectId) ?? [];
        list.push(p);
        childrenMap.set(p.parentProjectId, list);
      }
    }
    const result: { id: string; label: string }[] = [];
    for (const root of roots) {
      result.push({ id: root.id, label: root.name });
      for (const child of childrenMap.get(root.id) ?? []) {
        result.push({ id: child.id, label: `↳ ${child.name}` });
      }
    }
    return result;
  }, [projects]);

  const phaseDateRange = useMemo(() => {
    if (!todo?.phaseId) return { start: null as string | null, end: null as string | null };
    if (form.projectId !== todo.projectId) return { start: null as string | null, end: null as string | null };
    for (const proj of projects) {
      const phase = proj.phases?.find((p) => p.id === todo.phaseId);
      if (phase) return { start: phase.startDate ?? null, end: phase.endDate ?? null };
    }
    return { start: null as string | null, end: null as string | null };
  }, [todo?.phaseId, todo?.projectId, form.projectId, projects]);

  const deadlineIsPast = useMemo(() => {
    const d = form.deadline?.trim();
    if (!d) return false;
    const today = new Date().toISOString().split("T")[0];
    return d < today;
  }, [form.deadline]);

  useEffect(() => {
    if (!deadlineIsPast || !form.recurrence) return;
    onFormChange({ recurrence: null });
  }, [deadlineIsPast, form.recurrence, onFormChange]);

  const [tagInput, setTagInput] = useState("");
  const [tagsSaving, setTagsSaving] = useState(false);
  const [timeSessions, setTimeSessions] = useState<TimeSession[]>([]);
  const [timeTotalMinutes, setTimeTotalMinutes] = useState(0);
  const [activeTimer, setActiveTimer] = useState<TimeSession | null>(null);
  const [timeLoading, setTimeLoading] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");
  const [timeSaving, setTimeSaving] = useState(false);
  const [customFieldsSaving, setCustomFieldsSaving] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [reactionPickerCommentId, setReactionPickerCommentId] = useState<string | null>(null);
  const [, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<Collaborator[]>([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [allCollaborators, setAllCollaborators] = useState<Collaborator[]>([]);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [showAllComments, setShowAllComments] = useState(false);
  const [showSuggestSlot, setShowSuggestSlot] = useState(false);
  const [suggestDate, setSuggestDate] = useState("");
  const [suggestTime, setSuggestTime] = useState("09:00");
  const [suggestDuration, setSuggestDuration] = useState(30);
  const [mentionInviteOpen, setMentionInviteOpen] = useState(false);
  const [mentionInviteEmails, setMentionInviteEmails] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [slotPushRunning, setSlotPushRunning] = useState(false);

  useEffect(() => {
    getCollaborators().then(setAllCollaborators).catch(() => {});
  }, []);

  // Reset zone / side panels only when opening a different task — not on every
  // in-place update of the same `todo` (which would bounce the user back to Essentiel).
  const openTodoId = todo?.id;
  const initialZoneRef = useRef(initialZone);
  initialZoneRef.current = initialZone;
  useEffect(() => {
    if (!openTodoId) return;
    setEditZone(initialZoneRef.current);
    setComments([]);
    setCommentText("");
    setShowAllComments(false);
    setAttachments([]);
    let cancelled = false;
    getComments(openTodoId).then((c) => { if (!cancelled) setComments(c); }).catch(() => {});
    getAttachments(openTodoId).then((a) => { if (!cancelled) setAttachments(a); }).catch(() => {});
    if (canUseTimeTracking) {
      setTimeLoading(true);
      getTodoTimeSessions(openTodoId)
        .then((data) => {
          if (cancelled) return;
          setTimeSessions(data.sessions);
          setTimeTotalMinutes(data.totalMinutes);
          setActiveTimer(data.activeTimer);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setTimeLoading(false); });
    }
    return () => { cancelled = true; };
  }, [openTodoId, openNonce, canUseTimeTracking]);

  const formatLoggedMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
  };

  const handleStartTimer = async () => {
    if (!todo) return;
    setTimeSaving(true);
    try {
      const session = await startTodoTimer(todo.id);
      setActiveTimer(session);
      toast.success(t("timeTracking.running"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("timeTracking.error"));
    } finally {
      setTimeSaving(false);
    }
  };

  const handleStopTimer = async () => {
    if (!todo) return;
    setTimeSaving(true);
    try {
      const session = await stopTodoTimer(todo.id);
      setActiveTimer(null);
      setTimeSessions((prev) => [session, ...prev]);
      setTimeTotalMinutes((n) => n + (session.durationMinutes ?? 0));
      toast.success(t("timeTracking.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("timeTracking.error"));
    } finally {
      setTimeSaving(false);
    }
  };

  const handleAddManualTime = async () => {
    if (!todo) return;
    const mins = Number(manualMinutes);
    if (!Number.isFinite(mins) || mins < 1) return;
    setTimeSaving(true);
    try {
      const session = await addManualTodoTimeSession(todo.id, { durationMinutes: mins });
      setTimeSessions((prev) => [session, ...prev]);
      setTimeTotalMinutes((n) => n + (session.durationMinutes ?? 0));
      setManualMinutes("");
      toast.success(t("timeTracking.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("timeTracking.error"));
    } finally {
      setTimeSaving(false);
    }
  };

  const handleCustomFieldChange = async (fieldId: string, value: string | number | boolean | null) => {
    if (!todo || !isTaskOwner) return;
    const prev = { ...(todo.customFieldValues ?? {}) };
    const next = { ...prev, [fieldId]: value };
    setCustomFieldsSaving(true);
    try {
      const updated = await updateTodo(todo.id, { customFieldValues: next });
      onTodoUpdated?.(updated);
      toast.success(t("toast.taskUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.updateError"));
    } finally {
      setCustomFieldsSaving(false);
    }
  };

  if (!todo) return null;

  const handleAddTag = async () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || form.tags.includes(tag)) { setTagInput(""); return; }
    const prevTags = form.tags;
    const nextTags = [...prevTags, tag];
    onFormChange({ tags: nextTags });
    setTagInput("");
    if (!onPersistTags) return;
    setTagsSaving(true);
    try {
      await onPersistTags(nextTags);
    } catch {
      onFormChange({ tags: prevTags });
      toast.error(t("toast.updateError"));
    } finally {
      setTagsSaving(false);
    }
  };

  const handleRemoveTag = async (tag: string) => {
    const prevTags = form.tags;
    const nextTags = form.tags.filter((t2) => t2 !== tag);
    onFormChange({ tags: nextTags });
    if (!onPersistTags) return;
    setTagsSaving(true);
    try {
      await onPersistTags(nextTags);
    } catch {
      onFormChange({ tags: prevTags });
      toast.error(t("toast.updateError"));
    } finally {
      setTagsSaving(false);
    }
  };

  const formatAttachmentSize = (n: number) => {
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const handleAttachmentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const max = 5 * 1024 * 1024;
    if (file.size > max) {
      toast.error(t("edit.maxSize"));
      return;
    }
    setAttachmentUploading(true);
    try {
      const att = await uploadAttachment(todo.id, file);
      setAttachments((prev) => [...prev, att]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.updateError"));
    } finally {
      setAttachmentUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteAttachmentApi(todo.id, attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    } catch {
      toast.error(t("toast.updateError"));
    }
  };

  const handleCommentChange = (val: string) => {
    setCommentText(val);
    const cursor = commentInputRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (atMatch) {
      const q = atMatch[1].toLowerCase();
      setMentionQuery(q);
      setMentionResults(
        allCollaborators
          .filter((c) => c.status === "active" && c.email.toLowerCase().includes(q))
          .slice(0, 5)
      );
      setMentionIdx(0);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  const insertMention = (email: string) => {
    const cursor = commentInputRef.current?.selectionStart ?? commentText.length;
    const before = commentText.slice(0, cursor);
    const after = commentText.slice(cursor);
    const replaced = before.replace(/@([^\s@]*)$/, `@${email} `);
    setCommentText(replaced + after);
    setMentionQuery(null);
    setMentionResults([]);
    setTimeout(() => commentInputRef.current?.focus(), 0);
  };

  const handlePostComment = async () => {
    if (!commentText.trim() || !todo) return;
    setCommentLoading(true);
    try {
      const raw = await postCommentApi(todo.id, commentText.trim());
      const { mentionInviteNeeded, ...c } = raw;
      setComments((prev) => [...prev, c]);
      setCommentText("");
      setMentionQuery(null);
      setMentionResults([]);
      onTodoCommentsChanged?.(todo.id);
      if (mentionInviteNeeded && mentionInviteNeeded.length > 0) {
        setMentionInviteEmails(mentionInviteNeeded);
        setMentionInviteOpen(true);
      }
    } catch { /* ignore */ }
    setCommentLoading(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!todo) return;
    try {
      await deleteCommentApi(todo.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onTodoCommentsChanged?.(todo.id);
    } catch { /* ignore */ }
  };

  const handleEditComment = async (commentId: string) => {
    if (!todo || !editingText.trim()) return;
    try {
      const raw = await editCommentApi(todo.id, commentId, editingText.trim());
      const { mentionInviteNeeded, ...updated } = raw;
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingCommentId(null);
      setEditingText("");
      if (mentionInviteNeeded && mentionInviteNeeded.length > 0) {
        setMentionInviteEmails(mentionInviteNeeded);
        setMentionInviteOpen(true);
      }
    } catch { /* ignore */ }
  };

  const handleToggleReaction = async (commentId: string, emoji: string) => {
    if (!todo) return;
    try {
      const updated = await toggleReactionApi(todo.id, commentId, emoji);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    } catch { /* ignore */ }
    setReactionPickerCommentId(null);
  };

  const handlePushSlotToCalendar = () => {
    void (async () => {
      setSlotPushRunning(true);
      try {
        const r = await syncOneScheduledSlotToCalendar(todo.id, { skipIfConflict: false });
        if (r.outcome === "synced") {
          broadcastResourceChange("todos");
          toast.success(t("agenda.inAppSlotsSyncTaskSuccess"));
          await onExternalSlotSynced?.();
        } else if (r.outcome === "skipped") {
          toast.info(t("agenda.inAppSlotsSyncTaskSkipped"));
        } else {
          toast.error(r.message?.trim() ? r.message : t("agenda.inAppSlotsSyncTaskFailed"));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("agenda.inAppSlotsSyncTaskFailed"));
      } finally {
        setSlotPushRunning(false);
      }
    })();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => {
        if (mentionInviteOpen) return;
        void onClose();
      }}
    >
      <ConfirmDialog
        open={mentionInviteOpen}
        title={t("comments.mentionInviteTitle")}
        message={`${t("comments.mentionInviteIntro")}\n\n${mentionInviteEmails.join(", ")}\n\n${t("comments.mentionInviteQuestion")}`}
        variant="info"
        confirmLabel={t("comments.mentionInviteSend")}
        onCancel={() => {
          setMentionInviteOpen(false);
          setMentionInviteEmails([]);
        }}
        onConfirm={() => {
          const emails = [...mentionInviteEmails];
          setMentionInviteOpen(false);
          setMentionInviteEmails([]);
          void (async () => {
            let failed = 0;
            for (const email of emails) {
              try {
                await inviteCollaborator(email);
              } catch {
                failed++;
              }
            }
            if (failed === 0) toast.success(t("comments.mentionInviteToastOk"));
            else toast.error(t("comments.mentionInviteToastErr"));
          })();
        }}
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-edit-modal-title"
        className={`bg-white dark:bg-slate-900 shadow-2xl border border-zinc-200 dark:border-slate-700 w-full mx-4 ${
          uiV2
            ? "rounded-sm max-w-xl h-[min(36rem,90vh)] overflow-hidden flex flex-col"
            : "rounded-lg max-w-lg max-h-[90vh] overflow-y-auto"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-6 ${uiV2 ? "flex flex-col flex-1 min-h-0" : ""}`}>
        {viewOnly && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t("teamDash.viewOnlyHint")}
          </p>
        )}
        <div className={`${viewOnly ? "pointer-events-none select-none " : ""}${uiV2 ? "flex flex-col flex-1 min-h-0" : ""}`}>
        <h3
          id="task-edit-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-slate-100 mb-3 shrink-0"
        >
          {t("edit.title")}
        </h3>
        {uiV2 && (
          <TaskEditZoneTabs editZone={editZone} onEditZoneChange={setEditZone} />
        )}
        <div className={uiV2 ? "flex-1 min-h-0 overflow-hidden" : undefined}>
        <TaskEditEssentialsZone
          className={zoneCls("essentials")}
          todo={todo}
          form={form}
          onFormChange={onFormChange}
          isTaskOwner={isTaskOwner}
          viewOnly={viewOnly}
          canSyncToCalendar={canSyncToCalendar}
          slotPushRunning={slotPushRunning}
          onPushSlotToCalendar={handlePushSlotToCalendar}
          onManageMeet={onManageMeet}
        />

        <TaskEditPlanningZone
          className={zoneCls("planning")}
          todo={todo}
          form={form}
          onFormChange={onFormChange}
          isTaskOwner={isTaskOwner}
          freeTierContentLocks={freeTierContentLocks}
          deadlineIsPast={deadlineIsPast}
          phaseDateRange={phaseDateRange}
          sortedProjectOptions={sortedProjectOptions}
          effortDefaults={effortDefaults}
          onSuggestedSlotChange={onSuggestedSlotChange}
          showSuggestSlot={showSuggestSlot}
          onShowSuggestSlotChange={setShowSuggestSlot}
          suggestDate={suggestDate}
          onSuggestDateChange={setSuggestDate}
          suggestTime={suggestTime}
          onSuggestTimeChange={setSuggestTime}
          suggestDuration={suggestDuration}
          onSuggestDurationChange={setSuggestDuration}
        />

        <TaskEditCollabZone
          className={zoneCls("collab")}
          todo={todo}
          form={form}
          isTaskOwner={isTaskOwner}
          assignEmail={assignEmail}
          onAssignEmailChange={onAssignEmailChange}
          assignedUser={assignedUser}
          assignError={assignError}
          onClearAssign={onClearAssign}
          userDisplayName={userDisplayName}
          currentUserUid={currentUserUid}
          onAcceptDecline={onAcceptDecline}
        />

        <TaskEditAdvancedZone
          className={zoneCls("advanced", "space-y-0")}
          uiV2={uiV2}
          editZone={editZone}
          todo={todo}
          form={form}
          onFormChange={onFormChange}
          isTaskOwner={isTaskOwner}
          freeTierContentLocks={freeTierContentLocks}
          currentUserUid={currentUserUid}
          projectTasks={projectTasks}
          canUseDependencies={canUseDependencies}
          canUseTimeTracking={canUseTimeTracking}
          canUseCustomFields={canUseCustomFields}
          customFieldDefs={customFieldDefs}
          tagInput={tagInput}
          onTagInputChange={setTagInput}
          tagsSaving={tagsSaving}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          timeLoading={timeLoading}
          timeTotalMinutes={timeTotalMinutes}
          formatLoggedMins={formatLoggedMins}
          activeTimer={activeTimer}
          timeSaving={timeSaving}
          onStartTimer={handleStartTimer}
          onStopTimer={handleStopTimer}
          manualMinutes={manualMinutes}
          onManualMinutesChange={setManualMinutes}
          onAddManualTime={handleAddManualTime}
          timeSessions={timeSessions}
          customFieldsSaving={customFieldsSaving}
          onCustomFieldChange={handleCustomFieldChange}
          attachments={attachments}
          attachmentUploading={attachmentUploading}
          attachmentInputRef={attachmentInputRef}
          onAttachmentFile={handleAttachmentFile}
          onDeleteAttachment={handleDeleteAttachment}
          formatAttachmentSize={formatAttachmentSize}
          comments={comments}
          showAllComments={showAllComments}
          onShowAllCommentsChange={setShowAllComments}
          editingCommentId={editingCommentId}
          editingText={editingText}
          onEditingCommentIdChange={setEditingCommentId}
          onEditingTextChange={setEditingText}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
          reactionPickerCommentId={reactionPickerCommentId}
          onReactionPickerCommentIdChange={setReactionPickerCommentId}
          onToggleReaction={handleToggleReaction}
          commentText={commentText}
          commentLoading={commentLoading}
          commentInputRef={commentInputRef}
          onCommentChange={handleCommentChange}
          mentionResults={mentionResults}
          mentionIdx={mentionIdx}
          onMentionIdxChange={setMentionIdx}
          onClearMentions={() => {
            setMentionQuery(null);
            setMentionResults([]);
          }}
          onInsertMention={insertMention}
          onPostComment={handlePostComment}
          onOpenSubtasks={onOpenSubtasks}
          subtaskCount={subtaskCount}
        />
        </div>

        </div>

        <div className={`flex flex-col gap-3 mt-5 sm:flex-row sm:items-center sm:justify-between ${uiV2 ? "shrink-0" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            {!todo.parentId && onOpenSubtasks && !viewOnly && (
              <button
                type="button"
                onClick={() => onOpenSubtasks(todo)}
                className="flex items-center gap-1.5 rounded border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                title={t("subtask.add")}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {t("subtask.addShort")}
              </button>
            )}
            {isTaskOwner && !viewOnly && onRequestDeleteTask && todo.status === "active" && (
              <button
                type="button"
                onClick={() => void onRequestDeleteTask(todo)}
                className="rounded border border-red-200 dark:border-red-800/80 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                {t("edit.deleteTask")}
              </button>
            )}
          </div>
          <div className="flex gap-2 sm:ml-auto items-center justify-end">
            {saving && (
              <span className="text-xs text-zinc-400 dark:text-slate-500">{t("edit.saving")}</span>
            )}
            {!viewOnly && (
              <button
                type="button"
                onClick={() => void onClose()}
                className="rounded border border-zinc-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("edit.cancel")}
              </button>
            )}
            <button
              type="button"
              onClick={() => void onClose()}
              disabled={!form.title.trim()}
              className="rounded bg-slate-700 dark:bg-slate-600 px-5 py-2 text-sm font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-60 transition-colors"
            >
              {viewOnly ? t("a11y.close") : t("edit.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
