import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.USE_LOCAL_STORE = "true";
});

import { initStore } from "../persistence";
import {
  register,
  addGoogleAccount,
  addMicrosoftAccount,
  setGoogleAccountCalendars,
  setMicrosoftAccountCalendars,
  setPriorityCalendarAccount,
  getGoogleAccounts,
  getMicrosoftAccounts,
  getGlobalPriorityAccount,
  refreshGoogleAccountCalendarWriteAccess,
  mergeLiveCalendarWriteAccess,
  listBookableCalendars,
  resolveBookingTarget,
  isCalendarBookable,
} from "./authService";

describe("setPriorityCalendarAccount", () => {
  beforeAll(async () => {
    await initStore();
  });

  it("promotes account B to index 0 with a single defaultForBooking", () => {
    const { uid } = register({ email: "priority-acct@test.local", password: "password123" });
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 };

    const accountA = addGoogleAccount(uid, "a@gmail.com", tokens);
    const accountB = addGoogleAccount(uid, "b@gmail.com", tokens);

    setGoogleAccountCalendars(uid, accountA.id, [{
      calendarId: "cal-a",
      label: "A",
      color: "#000",
      enabled: true,
      defaultForBooking: true,
      canWriteBooking: true,
      primary: true,
    }]);
    setGoogleAccountCalendars(uid, accountB.id, [{
      calendarId: "cal-b",
      label: "B",
      color: "#111",
      enabled: true,
      defaultForBooking: false,
      canWriteBooking: true,
      primary: true,
    }]);

    setPriorityCalendarAccount(uid, "google", accountB.id);

    const accounts = getGoogleAccounts(uid);
    expect(accounts[0]?.id).toBe(accountB.id);
    const defaults = accounts.flatMap((a) =>
      a.calendars.filter((c) => c.defaultForBooking).map((c) => ({ accountId: a.id, calendarId: c.calendarId })),
    );
    expect(defaults).toEqual([{ accountId: accountB.id, calendarId: "cal-b" }]);
  });

  it("refreshes stale canWriteBooking before promotion via refresh helper", () => {
    const { uid } = register({ email: "stale-write@test.local", password: "password123" });
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 };
    const account = addGoogleAccount(uid, "stale@gmail.com", tokens);

    setGoogleAccountCalendars(uid, account.id, [{
      calendarId: "primary@gmail.com",
      label: "Primary",
      color: "#000",
      enabled: true,
      defaultForBooking: false,
      canWriteBooking: false,
      primary: true,
    }]);

    refreshGoogleAccountCalendarWriteAccess(uid, account.id, [{
      id: "primary@gmail.com",
      summary: "Primary",
      backgroundColor: "#000",
      primary: true,
      canWriteBooking: true,
    }]);

    setPriorityCalendarAccount(uid, "google", account.id);
    expect(getGlobalPriorityAccount(uid)).toEqual({ provider: "google", accountId: account.id });
  });
});

describe("calendar priority FCFS", () => {
  beforeAll(async () => {
    await initStore();
  });

  it("keeps Google priority when Microsoft connects second without stealing default", () => {
    const { uid } = register({ email: "fcfs-google-first@test.local", password: "password123" });
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 };

    const google = addGoogleAccount(uid, "user@gmail.com", tokens);
    setGoogleAccountCalendars(uid, google.id, [{
      calendarId: "g-primary",
      label: "Google",
      color: "#4285f4",
      enabled: true,
      defaultForBooking: true,
      canWriteBooking: true,
      primary: true,
    }]);

    const microsoft = addMicrosoftAccount(uid, "user@outlook.com", tokens);
    setMicrosoftAccountCalendars(uid, microsoft.id, [{
      calendarId: "ms-calendar",
      label: "Calendar",
      color: "#0078d4",
      enabled: true,
      defaultForBooking: false,
      canWriteBooking: true,
      primary: true,
    }]);

    expect(getGlobalPriorityAccount(uid)).toEqual({ provider: "google", accountId: google.id });
    const msDefaults = getMicrosoftAccounts(uid)[0]?.calendars.filter((c) => c.defaultForBooking) ?? [];
    expect(msDefaults).toHaveLength(0);
  });

  it("mergeLiveCalendarWriteAccess updates canWriteBooking from API", () => {
    const merged = mergeLiveCalendarWriteAccess(
      [{
        calendarId: "cal-1",
        label: "Cal",
        color: "#000",
        enabled: true,
        defaultForBooking: false,
        canWriteBooking: false,
        primary: true,
      }],
      [{
        id: "cal-1",
        summary: "Cal",
        backgroundColor: "#000",
        primary: true,
        canWriteBooking: true,
      }],
    );
    expect(merged[0]?.canWriteBooking).toBe(true);
  });
});

describe("multi-calendar bookable model", () => {
  beforeAll(async () => {
    await initStore();
  });

  it("allows bookable calendars on multiple Google + Microsoft accounts at once", () => {
    const { uid } = register({ email: "multi-bookable@test.local", password: "password123" });
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 };

    const g1 = addGoogleAccount(uid, "pro@gmail.com", tokens);
    const g2 = addGoogleAccount(uid, "perso@gmail.com", tokens);
    const ms = addMicrosoftAccount(uid, "client@outlook.com", tokens);

    setGoogleAccountCalendars(uid, g1.id, [{
      calendarId: "g-pro",
      label: "Work",
      color: "#4285f4",
      enabled: true,
      bookable: true,
      defaultForBooking: true,
      canWriteBooking: true,
      primary: true,
      customLabel: "Agenda Pro",
      tag: "Pro",
    }]);
    setGoogleAccountCalendars(uid, g2.id, [{
      calendarId: "g-perso",
      label: "Personal",
      color: "#34a853",
      enabled: true,
      bookable: true,
      defaultForBooking: false,
      canWriteBooking: true,
      primary: true,
      customLabel: "Perso",
      tag: "Perso",
    }]);
    setMicrosoftAccountCalendars(uid, ms.id, [{
      calendarId: "ms-client",
      label: "Client",
      color: "#0078d4",
      enabled: true,
      bookable: true,
      defaultForBooking: false,
      canWriteBooking: true,
      primary: true,
      tag: "Client",
    }]);

    const bookable = listBookableCalendars(uid);
    expect(bookable).toHaveLength(3);
    expect(bookable[0]?.isDefault).toBe(true);
    expect(bookable[0]?.customLabel).toBe("Agenda Pro");
    expect(bookable.map((b) => b.tag).sort()).toEqual(["Client", "Perso", "Pro"]);

    const override = resolveBookingTarget(uid, {
      provider: "microsoft",
      accountId: ms.id,
      calendarId: "ms-client",
    });
    expect(override).toEqual({
      provider: "microsoft",
      accountId: ms.id,
      calendarId: "ms-client",
    });
  });

  it("preserves customLabel, tag and bookable after write-access refresh", () => {
    const { uid } = register({ email: "preserve-meta@test.local", password: "password123" });
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 };
    const account = addGoogleAccount(uid, "meta@gmail.com", tokens);

    setGoogleAccountCalendars(uid, account.id, [{
      calendarId: "primary@gmail.com",
      label: "Primary",
      color: "#111",
      enabled: true,
      bookable: true,
      defaultForBooking: true,
      canWriteBooking: true,
      primary: true,
      customLabel: "Direction",
      tag: "Pro",
    }]);

    refreshGoogleAccountCalendarWriteAccess(uid, account.id, [{
      id: "primary@gmail.com",
      summary: "Primary (Google)",
      backgroundColor: "#222",
      primary: true,
      canWriteBooking: true,
    }]);

    const cal = getGoogleAccounts(uid)[0]?.calendars[0];
    expect(cal?.customLabel).toBe("Direction");
    expect(cal?.tag).toBe("Pro");
    expect(cal?.bookable).toBe(true);
    expect(cal?.enabled).toBe(true);
    expect(isCalendarBookable(cal!)).toBe(true);
  });

  it("keeps enabled read-only calendars consulted without making them bookable", () => {
    const { uid } = register({ email: "readonly-enabled@test.local", password: "password123" });
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600_000 };
    const a = addGoogleAccount(uid, "rw@gmail.com", tokens);
    const b = addGoogleAccount(uid, "ro@gmail.com", tokens);

    setGoogleAccountCalendars(uid, a.id, [{
      calendarId: "writable",
      label: "Writable",
      color: "#000",
      enabled: true,
      bookable: true,
      defaultForBooking: true,
      canWriteBooking: true,
      primary: true,
    }]);
    setGoogleAccountCalendars(uid, b.id, [{
      calendarId: "readonly",
      label: "Shared",
      color: "#999",
      enabled: true,
      bookable: false,
      defaultForBooking: false,
      canWriteBooking: false,
      primary: true,
    }]);

    const accounts = getGoogleAccounts(uid);
    const ro = accounts.find((x) => x.id === b.id)?.calendars[0];
    expect(ro?.enabled).toBe(true);
    expect(isCalendarBookable(ro!)).toBe(false);
    expect(listBookableCalendars(uid)).toHaveLength(1);
  });
});
