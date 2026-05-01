import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import { initStore } from "../persistence";
import {
  createTodo,
  updateTodo,
  listTodos,
  listArchivedTodos,
  permanentlyRemoveArchivedTodo,
} from "../services/todoService";

function parseArg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

async function main(): Promise<void> {
  const uid = parseArg("--uid");
  const email = parseArg("--email");
  if (!uid || !email) {
    console.error("Usage: npm run canary:todos-storage -- --uid <uid> --email <email>");
    process.exit(1);
  }

  await initStore();

  const marker = `canary-${Date.now()}`;
  const created = await createTodo(uid, email, {
    title: marker,
    priority: "medium",
    effort: "light",
    status: "active",
  });

  const activeAfterCreate = listTodos(uid).some((t) => t.id === created.id && t.status === "active");
  if (!activeAfterCreate) throw new Error("Canary failed: created task not found in active list");

  const completed = await updateTodo(uid, email, created.id, { status: "completed" });
  const archivedAfterComplete = listArchivedTodos(uid).some((t) => t.id === completed.id && t.status === "completed");
  if (!archivedAfterComplete) throw new Error("Canary failed: completed task not found in archived list");

  await permanentlyRemoveArchivedTodo(uid, completed.id);
  const stillPresent = listArchivedTodos(uid).some((t) => t.id === completed.id);
  if (stillPresent) throw new Error("Canary failed: cleanup did not remove archived canary task");

  console.log("[canary] OK create->update->archive->read->cleanup marker=%s", marker);
}

main().catch((err) => {
  console.error("[canary] fatal:", err);
  process.exit(99);
});
