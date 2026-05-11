import { describe, expect, test } from "vitest";

import { getEntitlements, resolveBillingPlan, resolveEntitlements } from "./entitlementsService";

describe("getEntitlements", () => {
  test("free has no integrations nor team reporting", () => {
    expect(getEntitlements("free")).toEqual({ integrations: false, teamReporting: false });
  });

  test("first has no integrations nor team reporting (commercial tier only)", () => {
    expect(getEntitlements("first")).toEqual({ integrations: false, teamReporting: false });
  });

  test("small has integrations but no team reporting", () => {
    expect(getEntitlements("small")).toEqual({ integrations: true, teamReporting: false });
  });

  test("large has both", () => {
    expect(getEntitlements("large")).toEqual({ integrations: true, teamReporting: true });
  });
});

describe("resolveEntitlements", () => {
  test("early bird overrides plan first to full access", () => {
    expect(resolveEntitlements("first", true)).toEqual({ integrations: true, teamReporting: true });
  });

  test("early bird overrides free to full access", () => {
    expect(resolveEntitlements("free", true)).toEqual({ integrations: true, teamReporting: true });
  });

  test("without early bird falls back to plan matrix", () => {
    expect(resolveEntitlements("first", false)).toEqual(getEntitlements("first"));
  });
});

describe("resolveBillingPlan", () => {
  test("defaults unknown to first (legacy)", () => {
    expect(resolveBillingPlan(undefined)).toBe("first");
    expect(resolveBillingPlan("enterprise")).toBe("first");
  });
});
