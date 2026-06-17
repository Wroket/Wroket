import { describe, expect, test } from "vitest";

import adminRoutes from "../routes/adminRoutes";

describe("adminRoutes", () => {
  test("registers engagement, ops and leads endpoints", () => {
    const paths = (adminRoutes.stack as Array<{ route?: { path: string } }>)
      .filter((layer) => layer.route)
      .map((layer) => layer.route!.path);
    expect(paths).toContain("/engagement");
    expect(paths).toContain("/ops");
    expect(paths).toContain("/leads");
  });
});
