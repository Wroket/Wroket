"use client";

import type { RefObject } from "react";
import { SoftLock, SoftLockHint, PlanBadge } from "@/components/SoftLock";
import { downloadAttachment } from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";
import type {
  Todo,
  Comment,
  Collaborator,
  Attachment,
  ProjectCustomFieldDef,
} from "@/lib/api";
import type { TimeSession } from "@/lib/api/timeSessions";
import type { TaskEditZone, TaskEditModalProps } from "./types";
import TaskShareLinksPanel from "@/components/TaskShareLinksPanel";

const REACTION_EMOJIS = ["\u{1F44D}", "\u{1F44E}", "\u2764\uFE0F", "\u{1F604}", "\u{1F680}", "\u2705"];

export interface TaskEditAdvancedZoneProps {
  className: string;
  uiV2: boolean;
  editZone: TaskEditZone;
  todo: Todo;
  form: TaskEditModalProps["form"];
  onFormChange: TaskEditModalProps["onFormChange"];
  isTaskOwner: boolean;
  freeTierContentLocks: boolean;
  currentUserUid?: string;
  projectTasks: Todo[];
  canUseDependencies: boolean;
  canUseTimeTracking: boolean;
  canUseCustomFields: boolean;
  customFieldDefs: ProjectCustomFieldDef[];
  tagInput: string;
  onTagInputChange: (value: string) => void;
  tagsSaving: boolean;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  timeLoading: boolean;
  timeTotalMinutes: number;
  formatLoggedMins: (mins: number) => string;
  activeTimer: TimeSession | null;
  timeSaving: boolean;
  onStartTimer: () => void;
  onStopTimer: () => void;
  manualMinutes: string;
  onManualMinutesChange: (value: string) => void;
  onAddManualTime: () => void;
  timeSessions: TimeSession[];
  customFieldsSaving: boolean;
  onCustomFieldChange: (fieldId: string, value: string | number | boolean | null) => void;
  attachments: Attachment[];
  attachmentUploading: boolean;
  attachmentInputRef: RefObject<HTMLInputElement | null>;
  onAttachmentFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  formatAttachmentSize: (n: number) => string;
  comments: Comment[];
  showAllComments: boolean;
  onShowAllCommentsChange: (show: boolean) => void;
  editingCommentId: string | null;
  editingText: string;
  onEditingCommentIdChange: (id: string | null) => void;
  onEditingTextChange: (text: string) => void;
  onEditComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  reactionPickerCommentId: string | null;
  onReactionPickerCommentIdChange: (id: string | null) => void;
  onToggleReaction: (commentId: string, emoji: string) => void;
  commentText: string;
  commentLoading: boolean;
  commentInputRef: RefObject<HTMLInputElement | null>;
  onCommentChange: (val: string) => void;
  mentionResults: Collaborator[];
  mentionIdx: number;
  onMentionIdxChange: (idx: number | ((prev: number) => number)) => void;
  onClearMentions: () => void;
  onInsertMention: (email: string) => void;
  onPostComment: () => void;
  onOpenSubtasks?: (todo: Todo) => void;
  subtaskCount: number;
}

export default function TaskEditAdvancedZone({
  className,
  uiV2,
  editZone,
  todo,
  form,
  onFormChange,
  isTaskOwner,
  freeTierContentLocks,
  currentUserUid,
  projectTasks,
  canUseDependencies,
  canUseTimeTracking,
  canUseCustomFields,
  customFieldDefs,
  tagInput,
  onTagInputChange,
  tagsSaving,
  onAddTag,
  onRemoveTag,
  timeLoading,
  timeTotalMinutes,
  formatLoggedMins,
  activeTimer,
  timeSaving,
  onStartTimer,
  onStopTimer,
  manualMinutes,
  onManualMinutesChange,
  onAddManualTime,
  timeSessions,
  customFieldsSaving,
  onCustomFieldChange,
  attachments,
  attachmentUploading,
  attachmentInputRef,
  onAttachmentFile,
  onDeleteAttachment,
  formatAttachmentSize,
  comments,
  showAllComments,
  onShowAllCommentsChange,
  editingCommentId,
  editingText,
  onEditingCommentIdChange,
  onEditingTextChange,
  onEditComment,
  onDeleteComment,
  reactionPickerCommentId,
  onReactionPickerCommentIdChange,
  onToggleReaction,
  commentText,
  commentLoading,
  commentInputRef,
  onCommentChange,
  mentionResults,
  mentionIdx,
  onMentionIdxChange,
  onClearMentions,
  onInsertMention,
  onPostComment,
  onOpenSubtasks,
  subtaskCount,
}: TaskEditAdvancedZoneProps) {
  const { t } = useLocale();

  return (
    <div id="zone-advanced" className={className}>
      {/* Tags */}
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700">
        <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400 mb-1.5">
          {t("tags.label")}
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {tag}
              <button type="button" onClick={() => void onRemoveTag(tag)} disabled={tagsSaving} className="hover:text-red-500 disabled:opacity-40">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder={t("tags.add")}
            value={tagInput}
            disabled={tagsSaving}
            onChange={(e) => onTagInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onAddTag(); } }}
            className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          />
          <button type="button" onClick={() => void onAddTag()} disabled={!tagInput.trim() || tagsSaving} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-40">+</button>
        </div>
      </div>

      {todo?.projectId && isTaskOwner && (
        <SoftLock
          locked={!canUseDependencies}
          tier="small"
          hintKey="planRequired.small"
          className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700"
          title={
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400">
              {t("dependencies.blockedBy")}
            </label>
          }
        >
          <div className="max-h-32 overflow-y-auto space-y-1">
            {projectTasks
              .filter((pt) => pt.id !== todo.id && !pt.parentId && pt.status === "active")
              .map((pt) => {
                const selected = (form.blockedByTodoIds ?? todo.blockedByTodoIds ?? []).includes(pt.id);
                return (
                  <label key={pt.id} className={`flex items-center gap-2 text-xs text-zinc-700 dark:text-slate-300 ${canUseDependencies ? "cursor-pointer" : "cursor-not-allowed"}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!canUseDependencies}
                      onChange={(e) => {
                        if (!canUseDependencies) return;
                        const cur = form.blockedByTodoIds ?? todo.blockedByTodoIds ?? [];
                        const next = e.target.checked
                          ? [...cur, pt.id]
                          : cur.filter((id) => id !== pt.id);
                        onFormChange({ blockedByTodoIds: next });
                      }}
                      className="rounded border-zinc-300 dark:border-slate-600"
                    />
                    <span className="truncate">{pt.title || t("todos.untitled")}</span>
                  </label>
                );
              })}
          </div>
          {projectTasks.filter((pt) => pt.id !== todo.id && !pt.parentId).length === 0 && (
            <p className="text-[10px] text-zinc-400 dark:text-slate-500">{t("dependencies.noneAvailable")}</p>
          )}
        </SoftLock>
      )}

      {isTaskOwner && (
        <SoftLock
          locked={!canUseTimeTracking}
          tier="small"
          hintKey="timeTracking.planRequired"
          className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700"
          title={
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400">
              {t("timeTracking.title")}
            </label>
          }
        >
          {timeLoading && canUseTimeTracking ? (
            <p className="text-xs text-zinc-400">…</p>
          ) : (
            <>
              <p className="text-xs text-zinc-600 dark:text-slate-300 mb-2">
                {t("timeTracking.total")}: <span className="font-semibold">{formatLoggedMins(timeTotalMinutes)}</span>
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {activeTimer ? (
                  <button
                    type="button"
                    onClick={() => void onStopTimer()}
                    disabled={timeSaving || !canUseTimeTracking}
                    className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {t("timeTracking.stop")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onStartTimer()}
                    disabled={timeSaving || !canUseTimeTracking}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {t("timeTracking.start")}
                  </button>
                )}
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={manualMinutes}
                  onChange={(e) => onManualMinutesChange(e.target.value)}
                  disabled={!canUseTimeTracking}
                  placeholder={t("timeTracking.minutes")}
                  className="w-20 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void onAddManualTime()}
                  disabled={timeSaving || !manualMinutes || !canUseTimeTracking}
                  className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs disabled:opacity-50"
                >
                  {t("timeTracking.manualAdd")}
                </button>
              </div>
              {timeSessions.length > 0 && (
                <ul className="text-[10px] text-zinc-500 dark:text-slate-400 space-y-0.5 max-h-20 overflow-y-auto">
                  {timeSessions.slice(0, 5).map((s) => (
                    <li key={s.id}>
                      {formatLoggedMins(s.durationMinutes ?? 0)} — {new Date(s.startedAt).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SoftLock>
      )}

      {todo?.projectId && isTaskOwner && (
        <SoftLock
          locked={!canUseCustomFields}
          tier="small"
          hintKey="projects.customFieldsPlanRequired"
          className="mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700"
          title={
            <label className="block text-xs font-medium text-zinc-500 dark:text-slate-400">
              {t("projects.customFieldsTitle")}
            </label>
          }
        >
          {customFieldDefs.length === 0 ? (
            canUseCustomFields ? (
              <p className="text-[10px] text-zinc-400 dark:text-slate-500">{t("projects.customFieldsEmpty")}</p>
            ) : null
          ) : (
            <div className="space-y-2">
              {[...customFieldDefs].sort((a, b) => a.order - b.order).map((def) => {
                const val = todo.customFieldValues?.[def.id];
                const fieldDisabled = customFieldsSaving || !canUseCustomFields;
                return (
                  <div key={def.id}>
                    <span className="text-[10px] text-zinc-500 dark:text-slate-400">{def.name}</span>
                    {def.type === "checkbox" ? (
                      <label className="flex items-center gap-2 mt-0.5 text-xs">
                        <input
                          type="checkbox"
                          checked={val === true}
                          disabled={fieldDisabled}
                          onChange={(e) => void onCustomFieldChange(def.id, e.target.checked)}
                          className="rounded border-zinc-300"
                        />
                      </label>
                    ) : def.type === "select" ? (
                      <select
                        value={typeof val === "string" ? val : ""}
                        disabled={fieldDisabled}
                        onChange={(e) => void onCustomFieldChange(def.id, e.target.value || null)}
                        className="mt-0.5 w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800"
                      >
                        <option value="">—</option>
                        {(def.options ?? []).map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : def.type === "date" ? (
                      <input
                        type="date"
                        value={typeof val === "string" ? val : ""}
                        disabled={fieldDisabled}
                        onChange={(e) => void onCustomFieldChange(def.id, e.target.value || null)}
                        className="mt-0.5 w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800"
                      />
                    ) : def.type === "number" ? (
                      <input
                        type="number"
                        value={typeof val === "number" ? val : ""}
                        disabled={fieldDisabled}
                        onChange={(e) => void onCustomFieldChange(def.id, e.target.value === "" ? null : Number(e.target.value))}
                        className="mt-0.5 w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800"
                      />
                    ) : (
                      <input
                        type="text"
                        value={typeof val === "string" ? val : ""}
                        disabled={fieldDisabled}
                        onChange={(e) => void onCustomFieldChange(def.id, e.target.value || null)}
                        className="mt-0.5 w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs dark:bg-slate-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SoftLock>
      )}

      {/* Attachments */}
      <div className={`${uiV2 && editZone !== "advanced" ? "hidden " : ""}mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700`}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div>
            <h4 className="text-xs font-medium text-zinc-500 dark:text-slate-400 inline-flex items-center gap-2">
              {t("edit.attachments")}
              {freeTierContentLocks && isTaskOwner && <PlanBadge tier="freeQuota" />}
            </h4>
            <p className="text-[10px] text-zinc-400 dark:text-slate-500 mt-0.5">{t("edit.maxSize")}</p>
          </div>
          {isTaskOwner && (
            <>
              <input
                ref={attachmentInputRef}
                type="file"
                className="sr-only"
                onChange={onAttachmentFile}
                accept="image/*,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={attachmentUploading || freeTierContentLocks}
              />
              <button
                type="button"
                disabled={attachmentUploading || freeTierContentLocks}
                onClick={() => {
                  if (freeTierContentLocks) return;
                  attachmentInputRef.current?.click();
                }}
                className="shrink-0 rounded border border-emerald-300 dark:border-emerald-600 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
              >
                {t("edit.addFile")}
              </button>
            </>
          )}
        </div>
        {freeTierContentLocks && isTaskOwner && (
          <SoftLockHint tier="freeQuota" hintKey="quota.free.attachmentsDisabled" className="mb-2" />
        )}
        {attachments.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-slate-500 italic">{t("edit.noAttachments")}</p>
        ) : (
          <ul className="space-y-1.5">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs min-w-0">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-emerald-600 dark:text-emerald-400 hover:underline truncate"
                  onClick={() => void downloadAttachment(todo.id, a.id, a.originalName)}
                >
                  {a.originalName}
                </button>
                <span className="text-zinc-400 dark:text-slate-500 shrink-0 tabular-nums">{formatAttachmentSize(a.size)}</span>
                {isTaskOwner && (
                  <button
                    type="button"
                    onClick={() => void onDeleteAttachment(a.id)}
                    className="text-zinc-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 shrink-0"
                    title={t("a11y.delete")}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Comments */}
      <div className={`${uiV2 && editZone !== "advanced" ? "hidden " : ""}mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700`}>
        <h4 className="text-xs font-medium text-zinc-500 dark:text-slate-400 mb-2">
          {t("comments.title")} ({comments.length})
        </h4>
        <div className="max-h-48 overflow-y-auto space-y-2 mb-2">
          {comments.length === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-slate-500 italic">{t("comments.empty")}</p>
          ) : <>
          {comments.length > 3 && !showAllComments && (
            <button
              type="button"
              onClick={() => onShowAllCommentsChange(true)}
              className="w-full text-center text-[11px] text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium py-1 transition-colors"
            >
              {t("comments.showOlder")} ({comments.length - 3})
            </button>
          )}
          {(showAllComments ? comments : comments.slice(-3)).map((c) => (
            <div key={c.id} className="bg-zinc-50 dark:bg-slate-800/60 rounded px-3 py-2 text-xs group">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-zinc-700 dark:text-slate-300">{c.userEmail}</span>
                  {c.editedAt && <span className="text-[10px] text-zinc-400 dark:text-slate-500 italic">{t("comments.edited")}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-400 dark:text-slate-500">
                    {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {currentUserUid === c.userId && (
                    <>
                      <button type="button" onClick={() => { onEditingCommentIdChange(c.id); onEditingTextChange(c.text); }} className="text-zinc-300 dark:text-slate-600 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" title={t("comments.edit")}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button type="button" onClick={() => onDeleteComment(c.id)} className="text-zinc-300 dark:text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editingCommentId === c.id ? (
                <div className="flex gap-1.5 mt-1">
                  <input type="text" value={editingText} onChange={(e) => onEditingTextChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEditComment(c.id); } if (e.key === "Escape") onEditingCommentIdChange(null); }} autoFocus className="flex-1 rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500" />
                  <button type="button" onClick={() => onEditComment(c.id)} disabled={!editingText.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-2 py-1 text-xs text-white disabled:opacity-40">{t("edit.save")}</button>
                  <button type="button" onClick={() => onEditingCommentIdChange(null)} className="rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs text-zinc-600 dark:text-slate-300">{t("edit.cancel")}</button>
                </div>
              ) : (
                <p className="text-zinc-600 dark:text-slate-400 whitespace-pre-wrap">{c.text.split(/(@[\w.+-]+@[\w.-]+)/g).map((part, i) => /^@[\w.+-]+@[\w.-]+$/.test(part) ? <span key={i} className="text-indigo-600 dark:text-indigo-400 font-medium">{part}</span> : part)}</p>
              )}
              {/* Reactions */}
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {c.reactions && Object.entries(c.reactions).map(([emoji, userIds]) => (
                  <button key={emoji} type="button" onClick={() => onToggleReaction(c.id, emoji)} className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] border transition-colors ${currentUserUid && userIds.includes(currentUserUid) ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/40" : "border-zinc-200 dark:border-slate-700 hover:border-zinc-400 dark:hover:border-slate-500"}`}>
                    <span>{emoji}</span>
                    <span className="text-zinc-500 dark:text-slate-400">{userIds.length}</span>
                  </button>
                ))}
                <div className="relative">
                  <button type="button" onClick={() => onReactionPickerCommentIdChange(reactionPickerCommentId === c.id ? null : c.id)} className="text-zinc-300 dark:text-slate-600 hover:text-zinc-500 dark:hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none" title={t("comments.addReaction")}>+</button>
                  {reactionPickerCommentId === c.id && (
                    <div className="absolute bottom-full left-0 mb-1 flex gap-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-zinc-200 dark:border-slate-700 p-1.5 z-10">
                      {REACTION_EMOJIS.map((emoji) => (
                        <button key={emoji} type="button" onClick={() => onToggleReaction(c.id, emoji)} className="hover:bg-zinc-100 dark:hover:bg-slate-700 rounded p-0.5 text-sm">{emoji}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          </>}
        </div>
        <div className="relative flex gap-1.5">
          <div className="flex-1 relative">
            <input
              ref={commentInputRef}
              type="text"
              placeholder={t("comments.placeholder")}
              value={commentText}
              onChange={(e) => onCommentChange(e.target.value)}
              onKeyDown={(e) => {
                if (mentionResults.length > 0) {
                  if (e.key === "ArrowDown") { e.preventDefault(); onMentionIdxChange((i) => Math.min(i + 1, mentionResults.length - 1)); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); onMentionIdxChange((i) => Math.max(i - 1, 0)); return; }
                  if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); onInsertMention(mentionResults[mentionIdx].email); return; }
                  if (e.key === "Escape") { e.preventDefault(); onClearMentions(); return; }
                }
                if (e.key === "Enter") { e.preventDefault(); onPostComment(); }
              }}
              className="w-full rounded border border-zinc-300 dark:border-slate-600 px-2 py-1 text-xs text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            {mentionResults.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-full bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                {mentionResults.map((c, i) => (
                  <button
                    key={c.email}
                    type="button"
                    onClick={() => onInsertMention(c.email)}
                    className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
                      i === mentionIdx
                        ? "bg-slate-100 dark:bg-slate-700 text-zinc-900 dark:text-slate-100"
                        : "text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-700"
                    }`}
                  >
                    {c.email}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onPostComment} disabled={commentLoading || !commentText.trim()} className="rounded bg-slate-700 dark:bg-slate-600 px-3 py-1 text-xs font-medium text-white dark:text-slate-100 disabled:opacity-40">
            {t("comments.send")}
          </button>
        </div>
      </div>

      {!todo.parentId && onOpenSubtasks && (
        <div className={`${uiV2 && editZone !== "advanced" ? "hidden " : ""}mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-zinc-700 dark:text-slate-300">
              {t("subtask.title")}
            </h4>
            <button
              type="button"
              onClick={() => onOpenSubtasks(todo)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {t("subtask.addShort")}
            </button>
          </div>
          {subtaskCount === 0 ? (
            <p className="text-xs text-zinc-400 dark:text-slate-500">
              {t("subtask.none")}
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-slate-400">
              {subtaskCount} {t("subtask.title").toLowerCase()}
            </p>
          )}
        </div>
      )}

      {todo?.id && isTaskOwner && (
        <div className={`${uiV2 && editZone !== "advanced" ? "hidden " : ""}mt-4 pt-4 border-t border-zinc-200 dark:border-slate-700`}>
          <TaskShareLinksPanel todoId={todo.id} canManage={isTaskOwner} />
        </div>
      )}
    </div>
  );
}
