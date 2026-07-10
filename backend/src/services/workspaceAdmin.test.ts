import { describe, expect, it, beforeEach, vi } from "vitest";

vi.hoisted(() => {
  process.env.USE_LOCAL_STORE = "true";
});

import {
  _resetTeamsForTests,
  createTeam,
  addWorkspaceAdmin,
  removeWorkspaceAdmin,
  addTeamMember,
  getTeamRole,
  canManageTeamWorkspace,
  canAccessProductFeatures,
  getWorkspaceContext,
  countUsedSeats,
  patchTeamBilling,
  getTeam,
} from "./teamService";
import { getStore } from "../persistence";

const OWNER_UID = "uid-owner";
const WS_UID = "uid-ws-admin";
const OWNER_EMAIL = "owner@example.com";
const WS_EMAIL = "wsadmin@example.com";
const MEMBER_EMAIL = "member@example.com";

function seedUser(uid: string, email: string): void {
  const store = getStore();
  if (!store.users) store.users = {};
  (store.users as Record<string, unknown>)[uid] = { uid, email, billingPlan: "first" };
}

describe("workspace-admin RBAC", () => {
  beforeEach(() => {
    _resetTeamsForTests();
    seedUser(OWNER_UID, OWNER_EMAIL);
    seedUser(WS_UID, WS_EMAIL);
    seedUser("uid-member", MEMBER_EMAIL);
  });

  it("workspace-admin is hors siège in usedSeats", () => {
    const team = createTeam(OWNER_UID, "Acme", []);
    patchTeamBilling(team.id, { billingPlan: "small", seatCount: 5 });
    addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL);
    const updated = getTeam(team.id)!;
    expect(countUsedSeats(updated)).toBe(1);
    expect(updated.workspaceAdmins).toHaveLength(1);
  });

  it("getTeamRole returns workspace-admin for listed email", () => {
    const team = createTeam(OWNER_UID, "Acme", []);
    patchTeamBilling(team.id, { billingPlan: "small" });
    addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL);
    const updated = getTeam(team.id)!;
    expect(getTeamRole(updated, WS_UID, WS_EMAIL)).toBe("workspace-admin");
    expect(canManageTeamWorkspace(updated, WS_UID, WS_EMAIL)).toBe(true);
  });

  it("workspace-admin-only user cannot access product features", () => {
    const team = createTeam(OWNER_UID, "Acme", []);
    patchTeamBilling(team.id, { billingPlan: "small" });
    addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL);
    const ctx = getWorkspaceContext(WS_UID, WS_EMAIL);
    expect(ctx.isWorkspaceAdminOnly).toBe(true);
    expect(ctx.managedTeamIds).toContain(team.id);
    expect(canAccessProductFeatures(WS_UID, WS_EMAIL)).toBe(false);
  });

  it("seat member with workspace-admin elsewhere retains product access", () => {
    createTeam(OWNER_UID, "A", [WS_EMAIL]);
    seedUser("uid-other", "other@example.com");
    const teamB = createTeam("uid-other", "B", []);
    patchTeamBilling(teamB.id, { billingPlan: "small" });
    addWorkspaceAdmin(teamB.id, "uid-other", "other@example.com", WS_EMAIL);
    expect(canAccessProductFeatures(WS_UID, WS_EMAIL)).toBe(true);
  });

  it("rejects workspace-admin when email is already a seat member", () => {
    const team = createTeam(OWNER_UID, "Acme", [MEMBER_EMAIL]);
    patchTeamBilling(team.id, { billingPlan: "small" });
    expect(() => addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, MEMBER_EMAIL)).toThrow();
  });

  it("rejects seat member when email is workspace-admin", () => {
    const team = createTeam(OWNER_UID, "Acme", []);
    patchTeamBilling(team.id, { billingPlan: "small" });
    addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL);
    expect(() => addTeamMember(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL)).toThrow();
  });

  it("workspace-admin can self-remove", () => {
    const team = createTeam(OWNER_UID, "Acme", []);
    patchTeamBilling(team.id, { billingPlan: "small" });
    addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL);
    const updated = removeWorkspaceAdmin(team.id, WS_UID, WS_EMAIL, WS_EMAIL);
    expect(updated.workspaceAdmins).toHaveLength(0);
  });
});

describe("requireProductAccess middleware", () => {
  beforeEach(() => {
    _resetTeamsForTests();
    seedUser(OWNER_UID, OWNER_EMAIL);
    seedUser(WS_UID, WS_EMAIL);
    const team = createTeam(OWNER_UID, "Acme", []);
    patchTeamBilling(team.id, { billingPlan: "small" });
    addWorkspaceAdmin(team.id, OWNER_UID, OWNER_EMAIL, WS_EMAIL);
  });

  it("returns 403 code for workspace-admin-only", async () => {
    const { requireProductAccess } = await import("../middlewares/requireProductAccess");
    const { ForbiddenError } = await import("../utils/errors");
    const req = {
      user: { uid: WS_UID, email: WS_EMAIL },
    } as import("../controllers/authController").AuthenticatedRequest;
    await new Promise<void>((resolve) => {
      requireProductAccess(req, {} as import("express").Response, (err) => {
        expect(err).toBeInstanceOf(ForbiddenError);
        expect((err as import("../utils/errors").ForbiddenError).code).toBe("WORKSPACE_ADMIN_PRODUCT_DENIED");
        resolve();
      });
    });
  });
});
