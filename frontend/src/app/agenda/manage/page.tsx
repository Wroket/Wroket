"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import PageHelpButton from "@/components/PageHelpButton";
import { useToast } from "@/components/Toast";
import {
  getMe,
  getGoogleAuthUrl,
  getAccountCalendars,
  saveAccountCalendars,
  disconnectGoogleAccount,
  type GoogleAccountPublic,
  type GoogleCalendarEntry,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

const ACCOUNT_COLORS = [
  "#10b981", "#8b5cf6", "#3b82f6", "#f59e0b",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

type AccountWithCals = GoogleAccountPublic & { cals?: GoogleCalendarEntry[] };

export default function ManageCalendarsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountWithCals[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      const me = await getMe();
      const accs = me.googleAccounts ?? [];
      const withCals = await Promise.all(
        accs.map(async (a) => {
          try {
            const cals = await getAccountCalendars(a.id);
            return { ...a, cals };
          } catch {
            return { ...a, cals: undefined };
          }
        }),
      );
      setAccounts(withCals);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAccounts(); }, []);

  const handleConnect = async () => {
    try {
      const { url } = await getGoogleAuthUrl();
      if (!url.startsWith("https://accounts.google.com/")) return;
      window.location.href = url;
    } catch { /* ignore */ }
  };

  const handleDisconnect = async (accountId: string) => {
    try {
      await disconnectGoogleAccount(accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      toast.success(t("agenda.accountDisconnected"));
    } catch { /* ignore */ }
  };

  const toggleCalendar = (accountId: string, calendarId: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId
          ? {
              ...a,
              cals: a.cals?.map((c) => {
                if (c.calendarId !== calendarId) return c;
                const enabled = !c.enabled;
                return {
                  ...c,
                  enabled,
                  defaultForBooking: enabled ? c.defaultForBooking : false,
                };
              }),
            }
          : a,
      ),
    );
  };

  const setDefaultBookingCalendar = (accountId: string, calendarId: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId
          ? {
              ...a,
              cals: a.cals?.map((c) => ({
                ...c,
                enabled: c.calendarId === calendarId ? true : c.enabled,
                defaultForBooking: c.calendarId === calendarId && c.canWriteBooking !== false,
              })),
            }
          : a,
      ),
    );
  };

  const handleSave = async (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account?.cals) return;
    setSavingId(accountId);
    try {
      await saveAccountCalendars(accountId, account.cals);
      toast.success(t("agenda.calendarsSaved"));
    } catch { /* ignore */ }
    finally { setSavingId(null); }
  };

  return (
    <AppShell>
      <div className="max-w-[700px] space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-slate-100">{t("agenda.manageCalendars")}</h1>
            <PageHelpButton
              title={t("agenda.manageCalendars")}
              items={[
                { text: t("help.manage.connect") },
                { text: t("help.manage.select") },
                { text: t("help.manage.colors") },
              ]}
            />
          </div>
          <p className="text-sm text-zinc-500 dark:text-slate-400 mt-1">{t("agenda.manageDesc")}</p>
        </div>

        {/* Add account button */}
        <button
          type="button"
          onClick={handleConnect}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-white dark:bg-slate-800 border-2 border-dashed border-zinc-200 dark:border-slate-700 text-zinc-600 dark:text-slate-300 hover:border-zinc-400 dark:hover:border-slate-500 hover:text-zinc-800 dark:hover:text-slate-100 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          {accounts.length > 0 ? t("settings.addGoogleAccount") : t("agenda.connectGoogle")}
        </button>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-zinc-300 dark:text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-zinc-400 dark:text-slate-500">{t("settings.noGoogleAccounts")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.map((account, idx) => {
              const acctColor = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
              return (
                <div key={account.id} className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  {/* Account header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2.5">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-800" style={{ backgroundColor: acctColor }} />
                      <span className="text-sm font-semibold text-zinc-800 dark:text-slate-100">{account.email}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id)}
                      className="rounded px-2.5 py-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    >
                      {t("agenda.disconnect")}
                    </button>
                  </div>

                  {/* Calendar list */}
                  {account.cals && account.cals.length > 0 ? (
                    <div className="px-4 py-3 space-y-1">
                      <p className="text-[10px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-2">{t("settings.calendarSelect")}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-slate-400 mb-2">{t("agenda.defaultBookingCalendarHint")}</p>
                      {account.cals.map((cal) => (
                        <div
                          key={cal.calendarId}
                          className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-zinc-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={cal.enabled}
                            onChange={() => toggleCalendar(account.id, cal.calendarId)}
                            className="w-4 h-4 rounded border-zinc-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                          <span className="text-sm text-zinc-700 dark:text-slate-200 flex-1 truncate">{cal.label}</span>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-slate-400 cursor-pointer">
                            <input
                              type="radio"
                              name={`booking-default-${account.id}`}
                              checked={!!cal.defaultForBooking}
                              onChange={() => setDefaultBookingCalendar(account.id, cal.calendarId)}
                              disabled={cal.canWriteBooking === false}
                              className="w-3.5 h-3.5 border-zinc-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                            />
                            {cal.canWriteBooking === false ? t("agenda.readOnlyCalendar") : t("agenda.defaultBookingCalendar")}
                          </label>
                        </div>
                      ))}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleSave(account.id)}
                          disabled={savingId === account.id}
                          className="rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-xs font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
                        >
                          {savingId === account.id ? "..." : t("projects.save")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center">
                      <p className="text-xs text-zinc-400 dark:text-slate-500 italic">{t("agenda.noCalendarsAvailable")}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
