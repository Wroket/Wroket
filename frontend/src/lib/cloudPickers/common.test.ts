import { describe, expect, it } from "vitest";

import { mimeFromName, PICKER_IMAGE_EXTENSIONS } from "./common";
import { projectNumberFromClientId } from "./googleDrivePicker";

describe("cloud pickers helpers", () => {
  it("infers image MIME types from names", () => {
    expect(mimeFromName("Board.JPG")).toBe("image/jpeg");
    expect(mimeFromName("scan.heic")).toBe("image/heic");
    expect(mimeFromName("notes.txt")).toBe("");
  });

  it("keeps picker extensions dotted and lowercase", () => {
    for (const ext of PICKER_IMAGE_EXTENSIONS) expect(ext).toMatch(/^\.[a-z]+$/);
  });

  it("derives the Cloud project number from the OAuth client id", () => {
    expect(projectNumberFromClientId("846885741813-abc123.apps.googleusercontent.com")).toBe("846885741813");
    expect(projectNumberFromClientId("not-a-client")).toBe("");
    expect(projectNumberFromClientId("")).toBe("");
  });
});
