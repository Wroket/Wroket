import { describe, expect, it } from "vitest";

import { PaymentRequiredError } from "../utils/errors";

describe("PaymentRequiredError", () => {
  it("carries optional machine code for quota clients", () => {
    const e = new PaymentRequiredError("Limite atteinte", "FREE_QUOTA_TASKS");
    expect(e.statusCode).toBe(402);
    expect(e.message).toBe("Limite atteinte");
    expect(e.code).toBe("FREE_QUOTA_TASKS");
  });

  it("works with message only (legacy seat limit)", () => {
    const e = new PaymentRequiredError("Quota sièges");
    expect(e.code).toBeUndefined();
  });
});
