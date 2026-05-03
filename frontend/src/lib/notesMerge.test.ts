import { describe, expect, it } from "vitest";
import type { Note } from "@/lib/api";
import { mergeOwnNotesFromServer } from "./notesMerge";

function n(over: Partial<Note> & Pick<Note, "id" | "updatedAt">): Note {
  const { id, updatedAt, ...rest } = over;
  return {
    id,
    userId: "u1",
    title: rest.title ?? "t",
    content: rest.content ?? "",
    pinned: rest.pinned ?? false,
    createdAt: rest.createdAt ?? updatedAt,
    updatedAt,
    ...rest,
  };
}

describe("mergeOwnNotesFromServer", () => {
  it("drops local-only rows when not dirty (ghost purge)", () => {
    const server = [n({ id: "a", updatedAt: "2026-05-01T10:00:00.000Z" })];
    const local = [
      n({ id: "a", updatedAt: "2026-05-01T10:00:00.000Z" }),
      n({ id: "ghost", title: "gone", updatedAt: "2026-05-02T10:00:00.000Z" }),
    ];
    const out = mergeOwnNotesFromServer(server, local, [], []);
    expect(out.map((x) => x.id).sort()).toEqual(["a"]);
  });

  it("keeps local-only row when dirty (offline create pending)", () => {
    const server: Note[] = [];
    const local = [n({ id: "new1", title: "offline", updatedAt: "2026-05-03T10:00:00.000Z" })];
    const out = mergeOwnNotesFromServer(server, local, ["new1"], []);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("new1");
  });

  it("keeps local-only row when in deleted queue (pending server delete)", () => {
    const server = [n({ id: "x", updatedAt: "2026-05-01T10:00:00.000Z" })];
    const local = [n({ id: "x", updatedAt: "2026-05-01T10:00:00.000Z" })];
    const out = mergeOwnNotesFromServer(server, local, [], ["x"]);
    expect(out.some((r) => r.id === "x")).toBe(true);
  });

  it("uses server version when not dirty", () => {
    const server = [n({ id: "a", title: "server", updatedAt: "2026-05-03T12:00:00.000Z" })];
    const local = [n({ id: "a", title: "stale local", updatedAt: "2026-05-01T10:00:00.000Z" })];
    const out = mergeOwnNotesFromServer(server, local, [], []);
    expect(out[0]!.title).toBe("server");
  });

  it("dirty local wins over server when newer", () => {
    const server = [n({ id: "a", title: "server", updatedAt: "2026-05-01T10:00:00.000Z" })];
    const local = [n({ id: "a", title: "offline edit", updatedAt: "2026-05-03T12:00:00.000Z" })];
    const out = mergeOwnNotesFromServer(server, local, ["a"], []);
    expect(out[0]!.title).toBe("offline edit");
  });

  it("dirty local does not override when older than server", () => {
    const server = [n({ id: "a", title: "server fresh", updatedAt: "2026-05-03T12:00:00.000Z" })];
    const local = [n({ id: "a", title: "old dirty", updatedAt: "2026-05-01T10:00:00.000Z" })];
    const out = mergeOwnNotesFromServer(server, local, ["a"], []);
    expect(out[0]!.title).toBe("server fresh");
  });

  it("sorts pinned first then by updatedAt desc", () => {
    const server = [
      n({ id: "old", pinned: false, updatedAt: "2026-05-01T10:00:00.000Z" }),
      n({ id: "pin", pinned: true, updatedAt: "2026-04-01T10:00:00.000Z" }),
    ];
    const out = mergeOwnNotesFromServer(server, [], [], []);
    expect(out[0]!.id).toBe("pin");
    expect(out[1]!.id).toBe("old");
  });
});
