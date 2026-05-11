import { describe, expect, test } from "vitest";

import { getEntitlements, resolveBillingPlan } from "./entitlementsService";

describe("getEntitlements", () => {
  test("free and first have no integrations nor team reporting", () => {
    expect(getEntitlements("free")).toEqual({ integrations: false, teamReporting: false });
    expect(getEntitlements("first")).toEqual({ integrations: false, teamReporting: false });
  });

  test("small has integrations but no team reporting", () => {
    expect(getEntitlements("small")).toEqual({ integrations: true, teamReporting: false });
  });

  test("large has both", () => {
    expect(getEntitlements("large")).toEqual({ integrations: true, teamReporting: true });
  });
});

describe("resolveBillingPlan", () => {
  test("defaults unknown to first (legacy)", () => {
    expect(resolveBillingPlan(undefined)).toBe("first");
    expect(resolveBillingPlan("enterprise")).toBe("first");
  });
});
