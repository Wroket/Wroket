"use client";

import { useCallback, useEffect, useState } from "react";

import { SoftLock, SoftLockHint } from "@/components/SoftLock";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/LocaleContext";
import { getProjects, type Project } from "@/lib/api";
import {
  buildPortalUrl,
  createClientPortal,
  listClientPortals,
  revokeClientPortal,
  type ClientPortal,
} from "@/lib/api/clientPortal";

export default function ClientPortalPanel() {
  const { t } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const canUse = user?.entitlements?.clientPortal === true || user?.earlyBird === true;
  const [portals, setPortals] = useState<ClientPortal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [guestEmailsRaw, setGuestEmailsRaw] = useState("");
  const [showTasks, setShowTasks] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pList, projList] = await Promise.all([listClientPortals(), getProjects()]);
      setPortals(pList.filter((p) => !p.revokedAt));
      setProjects(projList.filter((p) => p.status === "active"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canUse) void refresh();
    else setLoading(false);
  }, [canUse, refresh]);

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = async () => {
    if (selectedIds.length === 0) {
      toast.error(t("portal.selectProjects"));
      return;
    }
    setCreating(true);
    try {
      const guestEmails = guestEmailsRaw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const portal = await createClientPortal({
        label: label || null,
        projectIds: selectedIds,
        expiryDays: 30,
        branding: { displayName: displayName || null },
        privacy: { showTasks, showAssignees: false, showComments: false, showAttachments: false },
        guestEmails,
      });
      toast.success(t("portal.created"));
      setLabel("");
      setDisplayName("");
      setGuestEmailsRaw("");
      setSelectedIds([]);
      setPortals((prev) => [portal, ...prev]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("portal.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildPortalUrl(token));
      toast.success(t("share.copied"));
    } catch {
      toast.error(t("share.copyError"));
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeClientPortal(id);
      setPortals((prev) => prev.filter((p) => p.id !== id));
      toast.success(t("portal.revoked"));
    } catch {
      toast.error(t("portal.revokeError"));
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-slate-400 mb-2">
        {t("portal.title")}
      </h3>
      <p className="text-xs text-zinc-500 dark:text-slate-400 mb-3">{t("portal.desc")}</p>

      <SoftLock locked={!canUse} tier="large">
        {!canUse && <SoftLockHint tier="large" className="mb-3" />}
        {loading ? (
          <div className="py-6 flex justify-center">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-3">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t("portal.labelPlaceholder")}
                className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("portal.brandPlaceholder")}
                className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={guestEmailsRaw}
                onChange={(e) => setGuestEmailsRaw(e.target.value)}
                placeholder={t("portal.guestEmailsPlaceholder")}
                className="w-full rounded border border-zinc-200 dark:border-slate-600 bg-transparent px-2 py-1.5 text-sm"
              />
              <p className="text-[11px] text-zinc-400">{t("portal.guestNote")}</p>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-slate-300">
                <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} />
                {t("portal.showTasks")}
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-zinc-100 dark:border-slate-800 rounded p-2">
                {projects.length === 0 ? (
                  <p className="text-xs text-zinc-400">{t("portal.noOwnedProjects")}</p>
                ) : (
                  projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleProject(p.id)}
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))
                )}
              </div>
              <button
                type="button"
                disabled={creating || !canUse}
                onClick={() => void handleCreate()}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {t("portal.create")}
              </button>
            </div>

            <ul className="space-y-2">
              {portals.map((portal) => (
                <li
                  key={portal.id}
                  className="flex items-center justify-between gap-2 text-xs border border-zinc-100 dark:border-slate-800 rounded px-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{portal.label || portal.token.slice(0, 10)}</p>
                    <p className="text-zinc-400 truncate">{portal.projectLinkTokens.length} projet(s)</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopy(portal.token)}
                      className="rounded px-2 py-1 border border-zinc-200 dark:border-slate-600"
                    >
                      {t("share.copy")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRevoke(portal.id)}
                      className="rounded px-2 py-1 text-red-600 border border-red-200 dark:border-red-900"
                    >
                      {t("share.revoke")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </SoftLock>
    </div>
  );
}
