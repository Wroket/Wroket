import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { broadcastResourceChange } from "./useResourceSync";

// Note: useResourceSync relies on browser APIs (addEventListener, BroadcastChannel)
// that are not available in the node test environment. We test the pure utility
// function broadcastResourceChange, and the hook behaviour through integration
// (the hook is covered by the cross-device Playwright E2E spec).

describe("broadcastResourceChange", () => {
  const originalWindow = global.window;
  let bcMessages: Array<{ channel: string; data: unknown }> = [];

  beforeEach(() => {
    bcMessages = [];
    (global as unknown as Record<string, unknown>).BroadcastChannel = class MockBC {
      name: string;
      constructor(name: string) { this.name = name; }
      postMessage(data: unknown) { bcMessages.push({ channel: this.name, data }); }
      close() {}
    };
    (global as unknown as Record<string, unknown>).window = {
      __wroketTabId: "test-tab-id",
      BroadcastChannel: (global as unknown as Record<string, unknown>).BroadcastChannel,
    };
  });

  afterEach(() => {
    (global as unknown as Record<string, unknown>).window = originalWindow;
    delete (global as unknown as Record<string, unknown>).BroadcastChannel;
  });

  it("sends a message on the correct channel", () => {
    broadcastResourceChange("notes");
    expect(bcMessages).toHaveLength(1);
    expect(bcMessages[0]!.channel).toBe("wroket-notes-sync");
  });

  it("includes the sourceTab in the message", () => {
    broadcastResourceChange("projects");
    const msg = bcMessages[0]!.data as { sourceTab?: string };
    expect(msg.sourceTab).toBe("test-tab-id");
  });

  it("sends on the right channel per resource", () => {
    broadcastResourceChange("todos");
    broadcastResourceChange("teams");
    expect(bcMessages[0]!.channel).toBe("wroket-todos-sync");
    expect(bcMessages[1]!.channel).toBe("wroket-teams-sync");
  });

  it("does not throw when BroadcastChannel is unavailable", () => {
    delete (global as unknown as Record<string, unknown>).BroadcastChannel;
    expect(() => broadcastResourceChange("notes")).not.toThrow();
  });
});

describe("getTabId (via broadcastResourceChange)", () => {
  it("generates a stable tab id and reuses it", () => {
    (global as unknown as Record<string, unknown>).BroadcastChannel = class {
      postMessage() {}
      close() {}
    };
    const w: Record<string, unknown> = {};
    (global as unknown as Record<string, unknown>).window = w;
    broadcastResourceChange("notes");
    broadcastResourceChange("notes");
    // Both calls use the same tabId (set on window.__wroketTabId)
    expect(typeof w.__wroketTabId).toBe("string");
    const id1 = w.__wroketTabId as string;
    broadcastResourceChange("notes");
    expect(w.__wroketTabId).toBe(id1);
    delete (global as unknown as Record<string, unknown>).BroadcastChannel;
    (global as unknown as Record<string, unknown>).window = undefined;
  });
});

describe("useResourceSync hook (smoke)", () => {
  it("exports are defined", async () => {
    const mod = await import("./useResourceSync");
    expect(typeof mod.useResourceSync).toBe("function");
    expect(typeof mod.broadcastResourceChange).toBe("function");
  });
});
