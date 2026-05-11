"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import PageHelpButton from "@/components/PageHelpButton";
import { useToast } from "@/components/Toast";
import {
  getMe,
  getGoogleAuthUrl,
  getMicrosoftAuthUrl,
  getAccountCalendars,
  saveAccountCalendars,
  disconnectGoogleAccount,
  getMicrosoftAccountCalendars,
  saveMicrosoftAccountCalendars,
  disconnectMicrosoftAccount,
  type GoogleAccountPublic,
  type GoogleCalendarEntry,
} from "@/lib/api";
import { useLocale } from "@/lib/LocaleContext";

const ACCOUNT_COLORS = [
  "#10b981", "#8b5cf6", "#3b82f6", "#f59e0b",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

type CalProvider = "google" | "microsoft";

type AccountWithCals = GoogleAccountPublic & { cals?: GoogleCalendarEntry[]; provider: CalProvider };

function hasBothCalendarProviders(accs: AccountWithCals[]): boolean {
  return accs.some((a) => a.provider === "google") && accs.some((a) => a.provider === "microsoft");
}

export default function ManageCalendarsPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<AccountWithCals[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [preferredBookingProvider, setPreferredBookingProvider] = useState<"google" | "microsoft" | undefined>();

  const loadAccounts = async () => {
    try {
      const me = await getMe();
      setPreferredBookingProvider(me.preferredBookingProvider);
      const google = (me.googleAccounts ?? []).map((a) => ({ ...a, provider: "google" as const }));
      const microsoft = (me.microsoftAccounts ?? []).map((a) => ({ ...a, provider: "microsoft" as const }));
      const combined = [...google, ...microsoft];
      const withCals = await Promise.all(
        combined.map(async (a) => {
          try {
            const cals =
              a.provider === "google"
                ? await getAccountCalendars(a.id)
                : await getMicrosoftAccountCalendars(a.id);
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

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    if (searchParams.get("microsoft") !== "connected") return;
    toast.success(t("agenda.outlookConnected"));
    router.replace("/agenda/manage", { scroll: false });
    void loadAccounts();
  }, [searchParams, router, toast, t]);

  const handleConnectGoogle = async () => {
    try {
      const { url } = await getGoogleAuthUrl();
      if (!url.startsWith("https://accounts.google.com/")) return;
      window.location.href = url;
    } catch { /* ignore */ }
  };

  const handleConnectMicrosoft = async () => {
    try {
      const { url } = await getMicrosoftAuthUrl();
      if (!url.startsWith("https://") && !url.startsWith("http://")) return;
      window.location.href = url;
    } catch { /* ignore */ }
  };

  const handleDisconnect = async (accountId: string, provider: CalProvider) => {
    try {
      if (provider === "google") {
        await disconnectGoogleAccount(accountId);
      } else {
        await disconnectMicrosoftAccount(accountId);
      }
      setAccounts((prev) => prev.filter((a) => !(a.id === accountId && a.provider === provider)));
      toast.success(t("agenda.accountDisconnected"));
    } catch { /* ignore */ }
  };

  const toggleCalendar = (accountId: string, provider: CalProvider, calendarId: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === accountId && a.provider === provider
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

  const setDefaultBookingCalendar = (accountId: string, provider: CalProvider, calendarId: string) => {
    setAccounts((prev) =>
      prev.map((a) =>
        ({
          ...a,
          cals: a.cals?.map((c) => {
            const selected = a.id === accountId && a.provider === provider && c.calendarId === calendarId;
            return {
              ...c,
              enabled: selected ? true : c.enabled,
              defaultForBooking: selected && c.canWriteBooking !== false,
            };
          }),
        })
      ),
    );
  };

  const setPriorityAccount = (accountId: string, provider: CalProvider) => {
    setAccounts((prev) => {
      let targetCalendarId: string | null = null;
      const target = prev.find((a) => a.id === accountId && a.provider === provider);
      if (target?.cals) {
        const writable = target.cals.find((c) => c.canWriteBooking !== false)
          ?? target.cals[0];
        targetCalendarId = writable?.calendarId ?? null;
      }
      if (!targetCalendarId) return prev;
      return prev.map((a) => ({
        ...a,
        cals: a.cals?.map((c) => {
          const selected = a.id === accountId && a.provider === provider && c.calendarId === targetCalendarId;
          return {
            ...c,
            enabled: a.id === accountId && a.provider === provider ? c.enabled : false,
            defaultForBooking: selected,
          };
        }),
      }));
    });
  };

  const handleSave = async (accountId: string, provider: CalProvider) => {
    const account = accounts.find((a) => a.id === accountId && a.provider === provider);
    if (!account?.cals) return;
    const key = `${provider}:${accountId}`;
    setSavingKey(key);
    try {
      if (provider === "google") {
        await saveAccountCalendars(accountId, account.cals);
      } else {
        await saveMicrosoftAccountCalendars(accountId, account.cals);
      }
      toast.success(t("agenda.calendarsSaved"));
      await loadAccounts();
    } catch { /* ignore */ }
    finally { setSavingKey(null); }
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
          {hasBothCalendarProviders(accounts) && (
            <p className="text-xs text-zinc-600 dark:text-slate-400 mt-2 rounded-lg bg-zinc-50 dark:bg-slate-800/80 px-3 py-2 border border-zinc-100 dark:border-slate-700">
              {preferredBookingProvider === "microsoft" ? t("agenda.bookingPreferenceOutlook") : preferredBookingProvider === "google" ? t("agenda.bookingPreferenceGoogle") : t("agenda.bookingPreferenceUnset")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">{t("agenda.sectionGoogle")}</p>
          <button
            type="button"
            onClick={handleConnectGoogle}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-white dark:bg-slate-800 border-2 border-dashed border-zinc-200 dark:border-slate-700 text-zinc-600 dark:text-slate-300 hover:border-zinc-400 dark:hover:border-slate-500 hover:text-zinc-800 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            {accounts.some((a) => a.provider === "google") ? t("settings.addGoogleAccount") : t("agenda.connectGoogle")}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-slate-500">{t("agenda.sectionOutlook")}</p>
          <button
            type="button"
            onClick={handleConnectMicrosoft}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-white dark:bg-slate-800 border-2 border-dashed border-zinc-200 dark:border-slate-700 text-zinc-600 dark:text-slate-300 hover:border-zinc-400 dark:hover:border-slate-500 hover:text-zinc-800 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
            </svg>
            {accounts.some((a) => a.provider === "microsoft") ? t("settings.addMicrosoftAccount") : t("agenda.connectOutlook")}
          </button>
        </div>

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
            <p className="text-sm text-zinc-400 dark:text-slate-500 mt-1">{t("settings.noMicrosoftAccounts")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.map((account, idx) => {
              const acctColor = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
              const isPriorityAccount = account.cals?.some((c) => !!c.defaultForBooking) ?? idx === 0;
              const rowKey = `${account.provider}:${account.id}`;
              return (
                <div key={rowKey} className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-slate-800/50 border-b border-zinc-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-800" style={{ backgroundColor: acctColor }} />
                      <span className="text-sm font-semibold text-zinc-800 dark:text-slate-100 truncate">{account.email}</span>
                      <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 bg-zinc-200 text-zinc-600 dark:bg-slate-700 dark:text-slate-300">
                        {account.provider === "google" ? "Google" : "Outlook"}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0 ${
                        isPriorityAccount
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-zinc-200 text-zinc-600 dark:bg-slate-700 dark:text-slate-300"
                      }`}>
                        {isPriorityAccount ? t("agenda.priorityAccount") : t("agenda.readOnlyAccount")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isPriorityAccount && (
                        <button
                          type="button"
                          onClick={() => setPriorityAccount(account.id, account.provider)}
                          className="rounded px-2.5 py-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30 transition-colors"
                        >
                          {t("agenda.setPriorityAccount")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDisconnect(account.id, account.provider)}
                        className="rounded px-2.5 py-1 text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        {t("agenda.disconnect")}
                      </button>
                    </div>
                  </div>

                  {account.cals && account.cals.length > 0 ? (
                    <div className="px-4 py-3 space-y-1">
                      <p className="text-[10px] text-zinc-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-2">{t("settings.calendarSelect")}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-slate-400 mb-2">{isPriorityAccount ? t("agenda.defaultBookingCalendarHint") : t("agenda.secondaryReadonlyHint")}</p>
                      {account.cals.map((cal) => (
                        <div
                          key={cal.calendarId}
                          className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-zinc-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={cal.enabled}
                            onChange={() => toggleCalendar(account.id, account.provider, cal.calendarId)}
                            disabled={!isPriorityAccount}
                            className="w-4 h-4 rounded border-zinc-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cal.color }} />
                          <span className="text-sm text-zinc-700 dark:text-slate-200 flex-1 truncate">{cal.label}</span>
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-slate-400 cursor-pointer">
                            <input
                              type="radio"
                              name="booking-default-global"
                              checked={!!cal.defaultForBooking}
                              onChange={() => setDefaultBookingCalendar(account.id, account.provider, cal.calendarId)}
                              disabled={!isPriorityAccount || cal.canWriteBooking === false}
                              className="w-3.5 h-3.5 border-zinc-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                            />
                            {!isPriorityAccount || cal.canWriteBooking === false ? t("agenda.readOnlyCalendar") : t("agenda.defaultBookingCalendar")}
                          </label>
                        </div>
                      ))}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleSave(account.id, account.provider)}
                          disabled={savingKey === rowKey}
                          className="rounded-lg bg-slate-700 dark:bg-slate-600 px-4 py-2 text-xs font-medium text-white dark:text-slate-100 hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 transition-colors"
                        >
                          {savingKey === rowKey ? "..." : t("projects.save")}
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
