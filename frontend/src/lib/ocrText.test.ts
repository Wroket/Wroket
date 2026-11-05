import { describe, expect, it } from "vitest";

import { ocrTextToHtml } from "./ocrText";

describe("ocrTextToHtml", () => {
  it("wraps each line in an auto-direction paragraph", () => {
    expect(ocrTextToHtml("Bonjour\nمرحبا")).toBe('<p dir="auto">Bonjour</p><p dir="auto">مرحبا</p>');
  });

  it("escapes HTML", () => {
    expect(ocrTextToHtml('<img src=x onerror="alert(1)"> & co')).toBe(
      '<p dir="auto">&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; co</p>',
    );
  });

  it("collapses blank lines and trims edges", () => {
    expect(ocrTextToHtml("\n\nA\r\n\r\n\r\nB\n\n")).toBe('<p dir="auto">A</p><p><br></p><p dir="auto">B</p>');
  });

  it("returns an empty string for empty text", () => {
    expect(ocrTextToHtml("  \n ")).toBe("");
  });
});
