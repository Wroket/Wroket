import { describe, expect, it } from "vitest";

import {
  buildGoogleChatTextReply,
  normalizeGoogleChatEvent,
} from "./googleChatEventNormalize";

describe("normalizeGoogleChatEvent", () => {
  it("parses Workspace add-on messagePayload", () => {
    const event = normalizeGoogleChatEvent({
      commonEventObject: { hostApp: "CHAT" },
      authorizationEventObject: { systemIdToken: "hdr.payload.sig" },
      chat: {
        user: { email: "francois@broudeur.com" },
        messagePayload: {
          space: { name: "spaces/AAA", displayName: "Site FTB" },
          message: { text: "@Wroket overdue", sender: { email: "francois@broudeur.com" } },
        },
      },
    });
    expect(event.kind).toBe("message");
    expect(event.isAddOn).toBe(true);
    expect(event.email).toBe("francois@broudeur.com");
    expect(event.messageText).toBe("@Wroket overdue");
    expect(event.spaceName).toBe("spaces/AAA");
    expect(event.systemIdToken).toBe("hdr.payload.sig");
  });

  it("parses classic MESSAGE events", () => {
    const event = normalizeGoogleChatEvent({
      type: "MESSAGE",
      user: { email: "a@b.com" },
      space: { name: "spaces/X" },
      message: { text: "@Wroket help" },
    });
    expect(event.kind).toBe("message");
    expect(event.isAddOn).toBe(false);
    expect(event.messageText).toBe("@Wroket help");
  });

  it("parses add-on addedToSpacePayload", () => {
    const event = normalizeGoogleChatEvent({
      chat: {
        user: { email: "a@b.com" },
        addedToSpacePayload: {
          space: { name: "spaces/Y", displayName: "Room" },
        },
      },
    });
    expect(event.kind).toBe("added_to_space");
    expect(event.isAddOn).toBe(true);
    expect(event.spaceDisplayName).toBe("Room");
  });
});

describe("buildGoogleChatTextReply", () => {
  it("returns DataActions for add-on", () => {
    expect(buildGoogleChatTextReply({ isAddOn: true, text: "hello" })).toEqual({
      hostAppDataAction: {
        chatDataAction: {
          createMessageAction: { message: { text: "hello" } },
        },
      },
    });
  });

  it("returns classic text for non-add-on", () => {
    expect(buildGoogleChatTextReply({ isAddOn: false, text: "hello" })).toEqual({
      text: "hello",
    });
  });
});
