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

function toPayload(form: TaskEditFormSnapshot): UpdateTodoPayload {
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

function serialize(form: TaskEditFormSnapshot): string {
  return JSON.stringify(toPayload(form));
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
  const todoIdRef = useRef<string | null>(null);
  const inFlightRef = useRef(0);
  const [saving, setSaving] = useState(false);

  const syncBaseline = useCallback(() => {
    baselineRef.current = serialize(formRef.current);
  }, []);

  useEffect(() => {
    if (!editingTodo) {
      baselineRef.current = "";
      todoIdRef.current = null;
      return;
    }
    if (todoIdRef.current !== editingTodo.id) {
      todoIdRef.current = editingTodo.id;
      baselineRef.current = serialize(formRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline only when switching tasks
  }, [editingTodo?.id]);

  useEffect(() => {
    if (!enabled) return;
    if (!editingTodo) return;
    if (!formRef.current.title.trim()) return;

    const next = serialize(formRef.current);
    if (next === baselineRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const form = formRef.current;
      if (!editingTodo || editingTodo.id !== todoIdRef.current) return;
      if (!form.title.trim()) return;
      const payload = toPayload(form);
      if (JSON.stringify(payload) === baselineRef.current) return;

      inFlightRef.current += 1;
      setSaving(true);
      try {
        const updated = await updateTodo(editingTodo.id, payload);
        const merged: TaskEditFormSnapshot = {
          ...form,
          title: updated.title,
          tags: updated.tags ?? form.tags,
          recurrence: updated.recurrence ?? form.recurrence,
        };
        baselineRef.current = serialize(merged);
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
    if (!editingTodo) return;
    const form = formRef.current;
    if (!form.title.trim()) return;
    const next = serialize(form);
    if (next === baselineRef.current) return;
    clearTimeout(timerRef.current);
    inFlightRef.current += 1;
    setSaving(true);
    try {
      const updated = await updateTodo(editingTodo.id, toPayload(form));
      const merged: TaskEditFormSnapshot = {
        ...form,
        title: updated.title,
        tags: updated.tags ?? form.tags,
        recurrence: updated.recurrence ?? form.recurrence,
      };
      baselineRef.current = serialize(merged);
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
