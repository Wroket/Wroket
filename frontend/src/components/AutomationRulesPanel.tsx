"use client";

import { useCallback, useEffect, useState } from "react";

import { SoftLock, SoftLockHint } from "@/components/SoftLock";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/LocaleContext";
import { API_BASE_URL, apiFetchDefaults, extractApiMessage, parseJsonOrThrow } from "@/lib/api/core";

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  actionValue: string;
  enabled: boolean;
  runLog: { at: string; todoId: string; message: string }[];
}

export default function AutomationRulesPanel() {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const canUse = !!user?.entitlements?.integrations || !!user?.earlyBird;
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("todo_created");
  const [action, setAction] = useState("add_tag");
  const [actionValue, setActionValue] = useState("auto");

  const load = useCallback(async () => {
    if (!canUse) return;
    const res = await fetch(`${API_BASE_URL}/automations`, { ...apiFetchDefaults });
    if (!res.ok) return;
    const data = (await res.json()) as { rules: AutomationRule[] };
    setRules(data.rules);
  }, [canUse]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/automations`, {
        ...apiFetchDefaults,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, trigger, action, actionValue }),
      });
      if (!res.ok) {
        const err = await parseJsonOrThrow(res);
        throw new Error(extractApiMessage(err, "error"));
      }
      const rule = (await res.json()) as AutomationRule;
      setRules((prev) => [rule, ...prev]);
      setName("");
      toast.success(t("automation.created"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("automation.createError"));
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {t("automation.title")}
      </h3>
      <p className="text-xs text-zinc-500">{t("automation.hint")}</p>
      <SoftLock locked={!canUse} tier="small">
        {!canUse && <SoftLockHint tier="small" />}
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("automation.namePlaceholder")}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
          />
          <select
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="todo_created">{t("automation.triggerCreated")}</option>
            <option value="todo_completed">{t("automation.triggerCompleted")}</option>
            <option value="deadline_approaching">{t("automation.triggerDeadline")}</option>
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="add_tag">{t("automation.actionTag")}</option>
            <option value="set_priority">{t("automation.actionPriority")}</option>
            <option value="assign">{t("automation.actionAssign")}</option>
          </select>
          <input
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
            placeholder={t("automation.valuePlaceholder")}
            className="rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void create()}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
        >
          {t("automation.create")}
        </button>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="text-xs border border-zinc-100 dark:border-slate-800 rounded p-2">
              <p className="font-medium">
                {r.name} · {r.trigger} → {r.action}={r.actionValue}
              </p>
              {r.runLog[0] && (
                <p className="text-zinc-400 mt-1">
                  {t("automation.lastLog")}: {r.runLog[0].message} ({r.runLog[0].at.slice(0, 16)})
                </p>
              )}
            </li>
          ))}
        </ul>
      </SoftLock>
    </div>
  );
}
