"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createApiKey,
  listApiKeys,
  mcpEndpointUrl,
  revokeApiKey,
  type ApiKeyPublic,
  type CreateApiKeyResponse,
} from "@/lib/api/apiKeys";
import { useLocale } from "@/lib/LocaleContext";
import { useToast } from "@/components/Toast";

/**
 * Settings → Intégrations → Connect your agent (API keys + MCP snippets).
 */
export default function AgentConnectPanel() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const endpoint = mcpEndpointUrl();

  const refresh = useCallback(async () => {
    const list = await listApiKeys();
    setKeys(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : t("toast.genericError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, t, toast]);

  const cursorSnippet = useMemo(() => {
    const keyPlaceholder = created?.key ?? "wrk_live_YOUR_KEY";
    return JSON.stringify(
      {
        mcpServers: {
          wroket: {
            url: endpoint,
            headers: {
              Authorization: `Bearer ${keyPlaceholder}`,
            },
          },
        },
      },
      null,
      2,
    );
  }, [created?.key, endpoint]);

  const claudeSnippet = useMemo(() => {
    const keyPlaceholder = created?.key ?? "wrk_live_YOUR_KEY";
    return JSON.stringify(
      {
        mcpServers: {
          wroket: {
            url: endpoint,
            headers: {
              Authorization: `Bearer ${keyPlaceholder}`,
            },
          },
        },
      },
      null,
      2,
    );
  }, [created?.key, endpoint]);

  const curlSnippet = useMemo(() => {
    const keyPlaceholder = created?.key ?? "wrk_live_YOUR_KEY";
    return `curl -sS -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${keyPlaceholder}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
  }, [created?.key, endpoint]);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(t("toast.genericError"));
    }
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("settings.agentKeyNameRequired"));
      return;
    }
    setCreating(true);
    try {
      const result = await createApiKey(trimmed);
      setCreated(result);
      setName("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await revokeApiKey(id);
      setConfirmRevokeId(null);
      if (created?.id === id) setCreated(null);
      await refresh();
      toast.success(t("settings.agentKeyRevoked"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.genericError"));
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-slate-400">{t("settings.agentConnectIntro")}</p>
      <p className="text-xs text-zinc-500 dark:text-slate-500">
        <Link href="/docs" className="text-emerald-700 dark:text-emerald-400 hover:underline">
          {t("settings.agentDocsLink")}
        </Link>
        {" · "}
        <span className="font-mono text-[11px]">{endpoint}</span>
      </p>

      <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-4 space-y-3 bg-white dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">{t("settings.agentCreateTitle")}</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            placeholder={t("settings.agentKeyNamePlaceholder")}
            className="flex-1 rounded-md border border-zinc-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100"
            aria-label={t("settings.agentKeyNamePlaceholder")}
          />
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
            className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {creating ? t("loading") : t("settings.agentCreateKey")}
          </button>
        </div>
        <p className="text-xs text-zinc-500 dark:text-slate-500">{t("settings.agentKeyLimitHint")}</p>
      </div>

      {created && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-key-secret-title"
          className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-3"
        >
          <h4 id="agent-key-secret-title" className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t("settings.agentSecretTitle")}
          </h4>
          <p className="text-xs text-amber-800 dark:text-amber-300">{t("settings.agentSecretWarn")}</p>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <code className="flex-1 break-all rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs font-mono text-zinc-900 dark:text-slate-100">
              {created.key}
            </code>
            <button
              type="button"
              onClick={() => void copyText("secret", created.key)}
              className="rounded-md border border-amber-400 dark:border-amber-600 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              {copied === "secret" ? t("settings.agentCopied") : t("settings.agentCopyKey")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="rounded-md bg-zinc-900 dark:bg-slate-100 text-white dark:text-zinc-900 px-3 py-1.5 text-xs font-medium"
            >
              {t("settings.agentSecretDone")}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-zinc-200 dark:border-slate-700 p-4 space-y-3">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">{t("settings.agentKeysListTitle")}</h4>
        {keys.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-slate-400">{t("settings.agentNoKeys")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-slate-800">
            {keys.map((k) => (
              <li key={k.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-slate-100 truncate">{k.name}</p>
                  <p className="text-xs font-mono text-zinc-500 dark:text-slate-400">
                    {k.prefix}…
                    {k.lastUsedAt
                      ? ` · ${t("settings.agentLastUsed")} ${new Date(k.lastUsedAt).toLocaleString()}`
                      : ` · ${t("settings.agentNeverUsed")}`}
                  </p>
                </div>
                {confirmRevokeId === k.id ? (
                  <div className="flex items-center gap-2" role="dialog" aria-modal="true">
                    <span className="text-xs text-zinc-600 dark:text-slate-400">{t("settings.agentRevokeConfirm")}</span>
                    <button
                      type="button"
                      disabled={revokingId === k.id}
                      onClick={() => void handleRevoke(k.id)}
                      className="rounded-md bg-red-600 text-white text-xs font-medium px-2.5 py-1.5 disabled:opacity-50"
                    >
                      {t("settings.agentRevoke")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(null)}
                      className="rounded-md text-xs font-medium px-2.5 py-1.5 text-zinc-600 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(k.id)}
                    className="rounded-md border border-zinc-200 dark:border-slate-600 text-xs font-medium px-2.5 py-1.5 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    {t("settings.agentRevoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-zinc-800 dark:text-slate-200">{t("settings.agentSnippetsTitle")}</h4>
        {(
          [
            { id: "cursor", title: t("settings.agentSnippetCursor"), body: cursorSnippet },
            { id: "claude", title: t("settings.agentSnippetClaude"), body: claudeSnippet },
            { id: "curl", title: t("settings.agentSnippetCurl"), body: curlSnippet },
          ] as const
        ).map((s) => (
          <div key={s.id} className="rounded-md border border-zinc-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-200 dark:border-slate-700">
              <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">{s.title}</span>
              <button
                type="button"
                onClick={() => void copyText(s.id, s.body)}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                {copied === s.id ? t("settings.agentCopied") : t("settings.agentCopy")}
              </button>
            </div>
            <pre className="p-3 text-[11px] font-mono overflow-x-auto text-zinc-800 dark:text-slate-200 whitespace-pre-wrap break-all">
              {s.body}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
