"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";
import {
  buildShareTaskUrl,
  createTaskShareLink,
  listTaskShareLinks,
  revokeTaskShareLink,
  type TaskShareLink,
} from "@/lib/api/taskShare";
import type { ShareLinkExpiryDays } from "@/lib/api/projectShare";

interface Props {
  todoId: string;
  canManage: boolean;
}

export default function TaskShareLinksPanel({ todoId, canManage }: Props) {
  const { t } = useLocale();
  const { toast } = useToast();
  const [links, setLinks] = useState<TaskShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expiryDays, setExpiryDays] = useState<ShareLinkExpiryDays>(30);

  const load = useCallback(async () => {
    if (!canManage || !todoId) return;
    setLoading(true);
    try {
      setLinks(await listTaskShareLinks(todoId));
    } catch {
      toast.error(t("share.loadError"));
    } finally {
      setLoading(false);
    }
  }, [canManage, todoId, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const link = await createTaskShareLink(todoId, { expiryDays });
      setLinks((prev) => [link, ...prev]);
      toast.success(t("share.created"));
      try {
        await navigator.clipboard.writeText(buildShareTaskUrl(link.token));
        toast.success(t("share.copied"));
      } catch {
        /* ignore */
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("share.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildShareTaskUrl(token));
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyError"));
    }
  };

  const handleRevoke = async (linkId: string) => {
    try {
      await revokeTaskShareLink(todoId, linkId);
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
      toast.success(t("share.revoked"));
    } catch {
      toast.error(t("share.revokeError"));
    }
  };

  if (!canManage) return null;

  return (
    <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-3 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-slate-400">
        {t("taskShare.title")}
      </h4>
      <p className="text-[11px] text-zinc-500 dark:text-slate-400">{t("taskShare.hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={expiryDays === null ? "never" : String(expiryDays)}
          onChange={(e) => {
            const v = e.target.value;
            setExpiryDays(v === "never" ? null : (Number(v) as 7 | 30 | 90));
          }}
          className="rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1 text-xs"
        >
          <option value="7">7 {t("share.days")}</option>
          <option value="30">30 {t("share.days")}</option>
          <option value="90">90 {t("share.days")}</option>
          <option value="never">{t("share.noExpiry")}</option>
        </select>
        <button
          type="button"
          disabled={creating}
          onClick={() => void handleCreate()}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("share.create")}
        </button>
      </div>
      {loading ? (
        <div className="py-3 flex justify-center">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {links
            .filter((l) => !l.revokedAt)
            .map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between gap-2 text-xs border border-zinc-100 dark:border-slate-800 rounded px-2 py-1.5"
              >
                <span className="truncate font-mono text-[10px]">{link.token.slice(0, 12)}…</span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopy(link.token)}
                    className="rounded px-2 py-0.5 border border-zinc-200 dark:border-slate-600"
                  >
                    {t("share.copy")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(link.id)}
                    className="rounded px-2 py-0.5 text-red-600 border border-red-200 dark:border-red-900"
                  >
                    {t("share.revoke")}
                  </button>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
