/**
 * Teams interact helpers tests.
 */

import { describe, expect, it } from "vitest";

import {
  _resetTeamsConnectionsForTests,
  countTeamsConnectionsForTenant,
  getTeamsConnectionByAadObjectId,
  upsertTeamsConnection,
} from "./teamsConnectionService";
import { parseTeamsTaskSubmit, teamsSlashHelp } from "./teamsInteractService";

describe("teamsInteractService", () => {
  it("parses Adaptive Card submit payloads", () => {
    expect(
      parseTeamsTaskSubmit({ action: "wroket_accept", todoId: "t1", targetUid: "u1" }),
    ).toEqual({ action: "accept", todoId: "t1", targetUid: "u1" });
    expect(parseTeamsTaskSubmit({ action: "accept", value: "t2|u2" })).toEqual({
      action: "accept",
      todoId: "t2",
      targetUid: "u2",
    });
    expect(parseTeamsTaskSubmit({})).toBeNull();
  });

  it("help lists PMO and time commands", () => {
    const h = teamsSlashHelp();
    expect(h).toContain("my-week");
    expect(h).toContain("team-risk");
    expect(h).toContain("add <titre>");
    expect(h).toContain("timer");
  });

  it("resolves multi-tenant Teams connections by aadObjectId and counts tenant connections", () => {
    _resetTeamsConnectionsForTests();
    upsertTeamsConnection({
      ownerUid: "u-alice",
      ownerEmail: "alice@corp.com",
      accessToken: "tok-1",
      tenantId: "tenant-shared",
      aadObjectId: "aad-oid-alice",
    });
    upsertTeamsConnection({
      ownerUid: "u-bob",
      ownerEmail: "bob@corp.com",
      accessToken: "tok-2",
      tenantId: "tenant-shared",
      aadObjectId: "aad-oid-bob",
    });

    expect(countTeamsConnectionsForTenant("tenant-shared")).toBe(2);
    expect(getTeamsConnectionByAadObjectId("aad-oid-bob")?.ownerUid).toBe("u-bob");
    expect(getTeamsConnectionByAadObjectId("aad-oid-alice")?.ownerUid).toBe("u-alice");
    _resetTeamsConnectionsForTests();
  });
});
