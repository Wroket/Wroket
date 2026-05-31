import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.USE_LOCAL_STORE = "true";
});

import { initStore } from "../persistence";
import {
  register,
  addGoogleAccount,
  setGoogleAccountCalendars,
  setPriorityCalendarAccount,
  getGoogleAccounts,
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
});
