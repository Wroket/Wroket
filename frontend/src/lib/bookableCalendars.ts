import type {
  BookableCalendarOption,
  GoogleAccountPublic,
  GoogleCalendarEntry,
  PreferredBookingTarget,
} from "@/lib/api/core";

type UserWithCalendars = {
  googleAccounts?: GoogleAccountPublic[];
  microsoftAccounts?: GoogleAccountPublic[];
} | null | undefined;

function isEffectivelyBookable(cal: GoogleCalendarEntry): boolean {
  if (cal.canWriteBooking === false) return false;
  if (cal.bookable === true || !!cal.defaultForBooking) return true;
  if (cal.bookable === false) return false;
  return !!cal.enabled;
}

/**
 * Derive bookable calendar options from the authenticated user payload
 * (googleAccounts / microsoftAccounts with calendars).
 */
export function getBookableCalendarsFromUser(user: UserWithCalendars): BookableCalendarOption[] {
  if (!user) return [];
  const out: BookableCalendarOption[] = [];

  const pushAccount = (
    provider: "google" | "microsoft",
    account: GoogleAccountPublic,
  ) => {
    for (const cal of account.calendars ?? []) {
      if (!isEffectivelyBookable(cal)) continue;
      const customLabel = cal.customLabel?.trim() || null;
      const displayName = customLabel || cal.label;
      out.push({
        provider,
        accountId: account.id,
        accountEmail: account.email,
        calendarId: cal.calendarId,
        label: cal.label,
        customLabel,
        displayName,
        tag: cal.tag?.trim() || null,
        color: cal.color,
        isDefault: !!cal.defaultForBooking,
      });
    }
  };

  for (const a of user.googleAccounts ?? []) pushAccount("google", a);
  for (const a of user.microsoftAccounts ?? []) pushAccount("microsoft", a);

  out.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, "fr");
  });
  return out;
}

export function bookingTargetKey(t: PreferredBookingTarget | BookableCalendarOption | null | undefined): string {
  if (!t) return "";
  return `${t.provider}:${t.accountId}:${t.calendarId}`;
}

export function findBookableOption(
  options: BookableCalendarOption[],
  target: PreferredBookingTarget | null | undefined,
): BookableCalendarOption | null {
  if (!target) return options.find((o) => o.isDefault) ?? options[0] ?? null;
  return (
    options.find(
      (o) =>
        o.provider === target.provider &&
        o.accountId === target.accountId &&
        o.calendarId === target.calendarId,
    ) ??
    options.find((o) => o.isDefault) ??
    options[0] ??
    null
  );
}

export function formatBookableLabel(opt: BookableCalendarOption): string {
  const tag = opt.tag ? ` [${opt.tag}]` : "";
  const star = opt.isDefault ? " ★" : "";
  return `${opt.displayName}${tag}${star}`;
}
