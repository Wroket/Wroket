import { describe, expect, it } from "vitest";

import {
  personalTemplateSeedBlocked,
  getProjectTemplateAvailability,
  firstSelectableTemplateId,
  FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL,
} from "./freeQuota";
import { PROJECT_TEMPLATES } from "@/app/projects/_components/types";
import type { AuthMeResponse } from "@/lib/api/core";

const freeUser: AuthMeResponse = {
  uid: "u1",
  email: "u@example.com",
  billingPlan: "free",
  earlyBird: false,
  freeQuotas: {
    maxActiveTasksPersonal: FREE_TIER_MAX_ACTIVE_TASKS_PERSONAL,
    activeTasksPersonal: 5,
    maxProjectsPersonal: 3,
    activeProjectsPersonal: 1,
    maxNotes: 50,
    notesCount: 0,
  },
} as AuthMeResponse;

const freeUserNearQuota: AuthMeResponse = {
  ...freeUser,
  freeQuotas: { ...freeUser.freeQuotas!, activeTasksPersonal: 20 },
};

const earlyBirdUser: AuthMeResponse = {
  ...freeUser,
  earlyBird: true,
  freeQuotas: undefined,
};

describe("personalTemplateSeedBlocked", () => {
  it("blocks when personal project template exceeds free task headroom", () => {
    expect(personalTemplateSeedBlocked(freeUserNearQuota, null, 10)).toBe(true);
    expect(personalTemplateSeedBlocked(freeUserNearQuota, null, 5)).toBe(false);
  });

  it("does not block team projects", () => {
    expect(personalTemplateSeedBlocked(freeUser, "team-1", 54)).toBe(false);
  });

  it("does not block early bird (no freeQuotas snapshot)", () => {
    expect(personalTemplateSeedBlocked(earlyBirdUser, null, 54)).toBe(false);
  });
});

describe("getProjectTemplateAvailability", () => {
  const quickStart = PROJECT_TEMPLATES.find((t) => t.id === "quick-start")!;
  const agileLite = PROJECT_TEMPLATES.find((t) => t.id === "agile-sprint-lite")!;
  const basic = PROJECT_TEMPLATES.find((t) => t.id === "basic")!;

  it("allows lite templates for free personal users with headroom", () => {
    expect(getProjectTemplateAvailability(quickStart, freeUser, null)).toMatchObject({
      selectable: true,
      lockReason: "none",
    });
    expect(getProjectTemplateAvailability(agileLite, freeUser, null)).toMatchObject({
      selectable: true,
      lockReason: "none",
    });
  });

  it("locks non-free templates for free personal users", () => {
    expect(getProjectTemplateAvailability(basic, freeUser, null)).toMatchObject({
      selectable: false,
      lockReason: "plan",
      requiredPlan: "first",
    });
  });

  it("locks lite templates when headroom is insufficient", () => {
    const userWithRoomForQuickStart: AuthMeResponse = {
      ...freeUser,
      freeQuotas: { ...freeUser.freeQuotas!, activeTasksPersonal: 17 },
    };
    expect(getProjectTemplateAvailability(quickStart, userWithRoomForQuickStart, null).selectable).toBe(true);
    expect(getProjectTemplateAvailability(agileLite, userWithRoomForQuickStart, null)).toMatchObject({
      selectable: false,
      lockReason: "headroom",
    });
    expect(getProjectTemplateAvailability(quickStart, freeUserNearQuota, null).selectable).toBe(false);
  });

  it("unlocks all templates for early bird", () => {
    expect(getProjectTemplateAvailability(basic, earlyBirdUser, null).selectable).toBe(true);
    expect(getProjectTemplateAvailability(agileLite, earlyBirdUser, null).selectable).toBe(true);
  });

  it("unlocks all templates for team projects", () => {
    expect(getProjectTemplateAvailability(basic, freeUser, "team-1").selectable).toBe(true);
  });
});

describe("firstSelectableTemplateId", () => {
  it("returns quick-start for free personal users", () => {
    expect(firstSelectableTemplateId(PROJECT_TEMPLATES, freeUser, null)).toBe("quick-start");
  });

  it("returns basic for early bird", () => {
    expect(firstSelectableTemplateId(PROJECT_TEMPLATES, earlyBirdUser, null)).toBe("quick-start");
  });
});
