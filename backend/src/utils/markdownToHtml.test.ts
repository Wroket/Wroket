import { describe, expect, test } from "vitest";

import { markdownToHtml } from "../utils/markdownToHtml";

describe("markdownToHtml", () => {
  test("converts headings and lists", () => {
    const html = markdownToHtml("# Title\n\n- one\n- two");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
  });

  test("escapes raw html", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
