import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.USE_LOCAL_STORE = "true";
});

import {
  upsertConnection,
  getConnectionForUser,
  deleteConnectionForUser,
  listConnectionSummariesForUser,
  _resetConnectionsForTests,
} from "./externalConnectionService";

describe("externalConnectionService", () => {
  beforeAll(async () => {
    const { initStore } = await import("../persistence");
    await initStore();
  });

  beforeEach(() => {
    _resetConnectionsForTests();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("upserts one connection per user per provider", () => {
    const first = upsertConnection({
      provider: "notion",
      ownerUid: "u1",
      ownerEmail: "a@test.com",
      accessToken: "tok1",
      workspaceName: "WS A",
    });
    const second = upsertConnection({
      provider: "notion",
      ownerUid: "u1",
      ownerEmail: "a@test.com",
      accessToken: "tok2",
      workspaceName: "WS B",
    });
    expect(second.id).toBe(first.id);
    expect(second.accessToken).toBe("tok2");
    expect(getConnectionForUser("u1", "notion")?.workspaceName).toBe("WS B");
  });

  it("lists summaries with disconnected monday stub", () => {
    upsertConnection({
      provider: "notion",
      ownerUid: "u2",
      ownerEmail: "b@test.com",
      accessToken: "tok",
      workspaceName: "Team",
    });
    const summaries = listConnectionSummariesForUser("u2", "b@test.com");
    expect(summaries).toHaveLength(2);
    expect(summaries.find((s) => s.provider === "notion")?.status).toBe("connected");
    expect(summaries.find((s) => s.provider === "monday")?.status).toBe("disconnected");
  });

  it("deletes connection for user", () => {
    upsertConnection({
      provider: "notion",
      ownerUid: "u3",
      ownerEmail: "c@test.com",
      accessToken: "tok",
    });
    expect(deleteConnectionForUser("u3", "notion")).toBe(true);
    expect(getConnectionForUser("u3", "notion")).toBeNull();
  });
});
