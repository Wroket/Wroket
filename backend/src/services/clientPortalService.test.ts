import { beforeEach, describe, expect, it } from "vitest";

import { getStore } from "../persistence";
import { register, setBillingPlanForUid, setEarlyBirdForUid } from "./authService";
import { createProject } from "./projectService";
import {
  createClientPortal,
  getClientPortalHubView,
  purgeClientPortalsForOwner,
  reloadClientPortalsFromStore,
  revokeClientPortal,
} from "./clientPortalService";
import { PaymentRequiredError } from "../utils/errors";

describe("clientPortalService", () => {
  beforeEach(() => {
    getStore().clientPortals = {};
    reloadClientPortalsFromStore();
  });

  it("create hub view and revoke", async () => {
    const user = register({
      email: `portal-${Date.now()}@test.local`,
      password: "password123",
    });
    setBillingPlanForUid(user.uid, "large");
    const project = createProject(user.uid, user.email, {
      name: "Portal Proj",
      description: "desc",
    });
    const portal = createClientPortal(user.uid, user.email, {
      label: "Client Acme",
      projectIds: [project.id],
      branding: { displayName: "Acme Corp" },
      privacy: { showTasks: true, showAssignees: false, showComments: false, showAttachments: false },
      guestEmails: ["stakeholder@acme.test"],
    });
    expect(portal.token).toBeTruthy();
    expect(portal.guestEmails).toEqual(["stakeholder@acme.test"]);

    const hub = await getClientPortalHubView(portal.token);
    expect(hub.branding.displayName).toBe("Acme Corp");
    expect(hub.projects.length).toBe(1);
    expect(hub.projects[0].projectName).toBe("Portal Proj");

    revokeClientPortal(user.uid, portal.id);
    await expect(getClientPortalHubView(portal.token)).rejects.toThrow();

    expect(purgeClientPortalsForOwner(user.uid)).toBeGreaterThanOrEqual(1);
  });

  it("requires large plan", () => {
    const user = register({
      email: `portal-free-${Date.now()}@test.local`,
      password: "password123",
    });
    const project = createProject(user.uid, user.email, { name: "No", description: "" });
    expect(() => createClientPortal(user.uid, user.email, { projectIds: [project.id] })).toThrow(
      PaymentRequiredError,
    );
  });

  it("early bird can create", () => {
    const user = register({
      email: `portal-eb-${Date.now()}@test.local`,
      password: "password123",
    });
    setEarlyBirdForUid(user.uid, true);
    const project = createProject(user.uid, user.email, { name: "EB", description: "" });
    const portal = createClientPortal(user.uid, user.email, { projectIds: [project.id] });
    expect(portal.token).toBeTruthy();
  });
});
