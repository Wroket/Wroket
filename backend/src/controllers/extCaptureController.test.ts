import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const pathMod = require("path") as typeof import("path");
  const osMod = require("os") as typeof import("os");
  process.env.USE_LOCAL_STORE = "true";
  process.env.LOCAL_STORE_PATH = pathMod.join(
    osMod.tmpdir(),
    `wroket-ext-capture-test-${process.pid}.json`,
  );
});

const storePath =
  process.env.LOCAL_STORE_PATH ||
  path.join(os.tmpdir(), `wroket-ext-capture-fallback-${process.pid}.json`);

import { initStore } from "../persistence";
import {
  authenticateApiKey,
  createExtensionApiKeyForUser,
  register,
} from "../services/authService";
import { findTodoForUserInRam } from "../services/todoService";
import { getNote } from "../services/noteService";
import { normalizeClipSource } from "../types/clipSource";

describe("ext capture source + extension key", () => {
  beforeAll(async () => {
    fs.writeFileSync(storePath, "{}", "utf-8");
    await initStore();
  });

  it("normalizes clip source", () => {
    const src = normalizeClipSource({
      url: "https://example.com/a",
      title: "Hello",
      excerpt: "x".repeat(2000),
      via: "other",
    });
    expect(src?.via).toBe("chrome_ext");
    expect(src?.excerpt?.length).toBe(1000);
  });

  it("extension key authenticates and createTodo keeps source", async () => {
    const { uid } = register({
      email: `ext-cap-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const created = createExtensionApiKeyForUser(uid, "Test browser");
    const auth = authenticateApiKey(`Bearer ${created.key}`);
    expect(auth?.user.uid).toBe(uid);
    expect(auth?.scopes).toContain("todos:write");

    const { createTodo } = await import("../services/todoService");
    const todo = await createTodo(uid, auth!.user.email, {
      title: "Clipped page",
      priority: "medium",
      source: {
        url: "https://example.com/article",
        title: "Article",
        excerpt: "Selected text",
        via: "chrome_ext",
      },
    });
    const stored = findTodoForUserInRam(uid, todo.id)?.todo;
    expect(stored?.source?.url).toBe("https://example.com/article");
    expect(stored?.source?.via).toBe("chrome_ext");
  });

  it("createNote keeps clip source", async () => {
    const { uid } = register({
      email: `ext-note-${crypto.randomUUID().slice(0, 8)}@test.local`,
      password: "password123",
    });
    const { createNote } = await import("../services/noteService");
    const note = createNote(uid, {
      title: "Clip note",
      content: "body",
      source: {
        url: "https://example.com/n",
        via: "chrome_ext",
      },
    });
    const stored = getNote(uid, note.id);
    expect(stored.source?.url).toBe("https://example.com/n");
  });
});
