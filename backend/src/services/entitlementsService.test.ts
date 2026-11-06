import { describe, expect, test } from "vitest";

import {
  getEntitlements,
  resolveBillingPlan,
  resolveEffectiveEntitlements,
  resolveEntitlements,
} from "./entitlementsService";

describe("getEntitlements", () => {
  test("free has no integrations, reporting, portal or work capture", () => {
    expect(getEntitlements("free")).toEqual({
      integrations: false,
      teamReporting: false,
      clientPortal: false,
      workCapture: false,
    });
  });

  test("first has no integrations, reporting, portal or work capture", () => {
    expect(getEntitlements("first")).toEqual({
      integrations: false,
      teamReporting: false,
      clientPortal: false,
      workCapture: false,
    });
  });

  test("small has integrations only", () => {
    expect(getEntitlements("small")).toEqual({
      integrations: true,
      teamReporting: false,
      clientPortal: false,
      workCapture: false,
    });
  });

  test("large has integrations, reporting, portal and work capture", () => {
    expect(getEntitlements("large")).toEqual({
      integrations: true,
      teamReporting: true,
      clientPortal: true,
      workCapture: true,
    });
  });
});

describe("resolveEntitlements", () => {
  test("early bird overrides plan first to full access", () => {
    expect(resolveEntitlements("first", true)).toEqual({
      integrations: true,
      teamReporting: true,
      clientPortal: true,
      workCapture: true,
    });
  });

  test("early bird overrides free to full access", () => {
    expect(resolveEntitlements("free", true)).toEqual({
      integrations: true,
      teamReporting: true,
      clientPortal: true,
      workCapture: true,
    });
  });

  test("without early bird falls back to plan matrix", () => {
    expect(resolveEntitlements("first", false)).toEqual(getEntitlements("first"));
    expect(resolveEntitlements("small", false).workCapture).toBe(false);
  });
});

describe("resolveEffectiveEntitlements", () => {
  test("a Large team seat grants work capture to a lower personal plan", () => {
    const merged = resolveEffectiveEntitlements(getEntitlements("free"), "large");
    expect(merged.workCapture).toBe(true);
    expect(merged.integrations).toBe(true);
  });

  test("a Small team seat does not grant work capture", () => {
    const merged = resolveEffectiveEntitlements(getEntitlements("free"), "small");
    expect(merged.integrations).toBe(true);
    expect(merged.workCapture).toBe(false);
  });

  test("a personal Large plan keeps work capture when the team plan is lower", () => {
    const merged = resolveEffectiveEntitlements(getEntitlements("large"), "small");
    expect(merged.workCapture).toBe(true);
  });
});

describe("resolveBillingPlan", () => {
  test("defaults unknown to first (legacy)", () => {
    expect(resolveBillingPlan(undefined)).toBe("first");
    expect(resolveBillingPlan("enterprise")).toBe("first");
  });
});
