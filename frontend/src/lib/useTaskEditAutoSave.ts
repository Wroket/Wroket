import { useCallback, useEffect, useRef, useState } from "react";

import { updateTodo, type Todo, type UpdateTodoPayload } from "@/lib/api";

export type TaskEditFormSnapshot = {
  title: string;
  priority: string;
  effort: string;
  startDate: string;
  deadline: string;
  assignedTo: string | null;
  estimatedMinutes: number | null;
  tags: string[];
  recurrence: unknown;
  projectId: string | null;
};

function basePayload(form: TaskEditFormSnapshot): UpdateTodoPayload {
  return {
    title: form.title,
    priority: form.priority as UpdateTodoPayload["priority"],
    effort: form.effort as UpdateTodoPayload["effort"],
    startDate: form.startDate || null,
    deadline: form.deadline || null,
    assignedTo: form.assignedTo,
    estimatedMinutes: form.estimatedMinutes,
    tags: form.tags,
    recurrence: form.recurrence as UpdateTodoPayload["recurrence"],
    projectId: form.projectId,
  };
}

/**
 * When the user changes estimated duration vs the last saved value, align the scheduled slot end
 * (start + minutes). We intentionally do NOT send `scheduledSlot` on every autosave: the backend
 * clears `suggestedSlot` whenever `scheduledSlot` is updated, and unrelated PATCHes must not touch the slot.
 */
function buildPayload(form: TaskEditFormSnapshot, todo: Todo | null): UpdateTodoPayload {
  const payload = basePayload(form);
  const formEst = form.estimatedMinutes ?? null;
  const todoEst = todo?.estimatedMinutes ?? null;
  const estimateChanged =
    todo != null &&
    formEst != null &&
    formEst > 0 &&
    formEst !== todoEst;
  if (
    estimateChanged &&
    todo.scheduledSlot?.start &&
    todo.scheduledSlot?.end
  ) {
    const startMs = new Date(todo.scheduledSlot.start).getTime();
    if (!Number.isNaN(startMs)) {
      payload.scheduledSlot = {
        ...todo.scheduledSlot,
        end: new Date(startMs + formEst * 60_000).toISOString(),
      };
    }
  }
  return payload;
}

function serializeForBaseline(form: TaskEditFormSnapshot, todo: Todo | null): string {
  return JSON.stringify(buildPayload(form, todo));
}

/**
 * Debounced PATCH when the task edit form diverges from the last saved baseline.
 * Use `syncBaseline` after other saves (e.g. immediate tag persist) to avoid a duplicate PATCH.
 */
export function useTaskEditAutoSave(options: {
  editingTodo: Todo | null;
  editForm: TaskEditFormSnapshot;
  onSaved: (updated: Todo) => void;
  onError?: (message: string) => void;
  debounceMs?: number;
  /** When false, no debounced save (e.g. read-only preview). Default true. */
  enabled?: boolean;
}): { saving: boolean; syncBaseline: () => void; flush: () => Promise<void> } {
  const { editingTodo, editForm, onSaved, onError, debounceMs = 550, enabled = true } = options;
  const baselineRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const formRef = useRef(editForm);
  formRef.current = editForm;
  const editingTodoRef = useRef<Todo | null>(null);
  editingTodoRef.current = editingTodo;
  const todoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(0);
  const [saving, setSaving] = useState(false);

  const syncBaseline = useCallback(() => {
    baselineRef.current = serializeForBaseline(formRef.current, editingTodoRef.current);
  }, []);

  useEffect(() => {
    if (!editingTodo) {
      baselineRef.current = "";
      todoIdRef.current = null;
      return;
    }
    if (todoIdRef.current !== editingTodo.id) {
      todoIdRef.current = editingTodo.id;
      baselineRef.current = serializeForBaseline(formRef.current, editingTodo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline only when switching tasks
  }, [editingTodo?.id]);

  useEffect(() => {
    if (!enabled) return;
    if (!editingTodo) return;
    if (!formRef.current.title.trim()) return;

    const next = serializeForBaseline(formRef.current, editingTodoRef.current);
    if (next === baselineRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const form = formRef.current;
      const td = editingTodoRef.current;
      if (!td || td.id !== todoIdRef.current) return;
      if (!form.title.trim()) return;
      const payload = buildPayload(form, td);
      if (JSON.stringify(payload) === baselineRef.current) return;

      inFlightRef.current += 1;
      setSaving(true);
      try {
        const updated = await updateTodo(td.id, payload);
        const merged: TaskEditFormSnapshot = {
          ...form,
          title: updated.title,
          tags: updated.tags ?? form.tags,
          recurrence: updated.recurrence ?? form.recurrence,
        };
        editingTodoRef.current = updated;
        baselineRef.current = serializeForBaseline(merged, updated);
        onSaved(updated);
      } catch (e) {
        onError?.(e instanceof Error ? e.message : "Save failed");
      } finally {
        inFlightRef.current -= 1;
        if (inFlightRef.current <= 0) setSaving(false);
      }
    }, debounceMs);

    return () => clearTimeout(timerRef.current);
  }, [editForm, editingTodo, debounceMs, onSaved, onError, enabled]);

  const flush = useCallback(async () => {
    if (!enabled) return;
    const td = editingTodoRef.current;
    if (!td) return;
    const form = formRef.current;
    if (!form.title.trim()) return;
    const next = serializeForBaseline(form, td);
    if (next === baselineRef.current) return;
    clearTimeout(timerRef.current);
    inFlightRef.current += 1;
    setSaving(true);
    try {
      const updated = await updateTodo(td.id, buildPayload(form, td));
      const merged: TaskEditFormSnapshot = {
        ...form,
        title: updated.title,
        tags: updated.tags ?? form.tags,
        recurrence: updated.recurrence ?? form.recurrence,
      };
      editingTodoRef.current = updated;
      baselineRef.current = serializeForBaseline(merged, updated);
      onSaved(updated);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Save failed");
    } finally {
      inFlightRef.current -= 1;
      if (inFlightRef.current <= 0) setSaving(false);
    }
  }, [editingTodo, onSaved, onError, enabled]);

  return { saving, syncBaseline, flush };
}
