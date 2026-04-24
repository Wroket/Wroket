/**
 * Read-only diagnostic script: locate a todo by title substring across the
 * Firestore shards for a given user (uid or email). Useful when a user reports
 * a missing task in the archive list — tells us whether the row still exists,
 * its current status, and whether it sits behind a parent/project filter.
 *
 * NEVER mutates data. Prints to stdout only.
 *
 * Prerequisites:
 *   - GOOGLE_CLOUD_PROJECT set (or in backend/.env).
 *   - Application Default Credentials (gcloud auth application-default login)
 *     with Datastore/Firestore read on the target project.
 *
 * Usage:
 *   npx ts-node backend/src/scripts/findTodoByTitle.ts --uid <uid> --q <substr>
 *   npx ts-node backend/src/scripts/findTodoByTitle.ts --email <email> --q <substr> --include-active
 *
 * Flags:
 *   --uid <uid>          : target user id (mutually exclusive with --email)
 *   --email <address>    : resolve uid via store/users, case-insensitive match
 *   --q <substring>      : case-insensitive substring to match against title
 *   --include-active     : include tasks with status === "active" (default: archived only)
 *   --limit <n>          : cap results (default 50)
 */

import path from "path";
import dotenv from "dotenv";
import { Firestore } from "@google-cloud/firestore";

import { TODO_SHARD_COUNT, todoShardDocId, todoShardIndex } from "../persistence";

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

interface Args {
  uid?: string;
  email?: string;
  q?: string;
  includeActive: boolean;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { includeActive: false, limit: 50 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--uid") { out.uid = next; i++; }
    else if (a === "--email") { out.email = next; i++; }
    else if (a === "--q") { out.q = next; i++; }
    else if (a === "--include-active") { out.includeActive = true; }
    else if (a === "--limit") { out.limit = Math.max(1, parseInt(next, 10) || 50); i++; }
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: findTodoByTitle --uid <uid> | --email <email> --q <substr> [--include-active] [--limit N]"
      );
      process.exit(0);
    }
  }
  return out;
}

async function resolveUid(db: Firestore, email: string): Promise<string | null> {
  const snap = await db.collection("store").doc("users").get();
  if (!snap.exists) return null;
  const data = (snap.data()?.data ?? {}) as Record<string, Record<string, unknown>>;
  const target = email.trim().toLowerCase();
  for (const [uid, user] of Object.entries(data)) {
    const e = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (e === target) return uid;
  }
  return null;
}

interface Hit {
  uid: string;
  todoId: string;
  title: string;
  status: string;
  statusChangedAt: string | null;
  createdAt: string | null;
  parentId: string | null;
  projectId: string | null;
  assignedTo: string | null;
}

function matches(row: Record<string, unknown>, needle: string): boolean {
  const title = typeof row.title === "string" ? row.title : "";
  return title.toLowerCase().includes(needle);
}

async function readUserTodos(db: Firestore, uid: string): Promise<Record<string, Record<string, unknown>>> {
  const shardIdx = todoShardIndex(uid);
  const [shardSnap, legacySnap] = await Promise.all([
    db.collection("store").doc(todoShardDocId(shardIdx)).get(),
    db.collection("store").doc("todos").get(),
  ]);

  const out: Record<string, Record<string, unknown>> = {};

  if (legacySnap.exists) {
    const legacy = legacySnap.data()?.data as Record<string, Record<string, Record<string, unknown>>> | undefined;
    const bucket = legacy?.[uid];
    if (bucket) {
      for (const [id, row] of Object.entries(bucket)) out[id] = row;
    }
  }

  if (shardSnap.exists) {
    const shard = shardSnap.data()?.data as Record<string, Record<string, Record<string, unknown>>> | undefined;
    const bucket = shard?.[uid];
    if (bucket) {
      for (const [id, row] of Object.entries(bucket)) out[id] = row;
    }
  }

  return out;
}

function toHit(uid: string, todoId: string, row: Record<string, unknown>): Hit {
  const pick = (k: string): string | null => {
    const v = row[k];
    return typeof v === "string" ? v : null;
  };
  return {
    uid,
    todoId,
    title: typeof row.title === "string" ? row.title : "",
    status: typeof row.status === "string" ? row.status : "unknown",
    statusChangedAt: pick("statusChangedAt"),
    createdAt: pick("createdAt"),
    parentId: pick("parentId"),
    projectId: pick("projectId"),
    assignedTo: pick("assignedTo"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.q) {
    console.error("Missing --q <substring>");
    process.exit(1);
  }
  if (!args.uid && !args.email) {
    console.error("Missing --uid or --email");
    process.exit(1);
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("GOOGLE_CLOUD_PROJECT is required");
    process.exit(1);
  }

  const db = new Firestore({ projectId });

  let uid = args.uid;
  if (!uid && args.email) {
    const resolved = await resolveUid(db, args.email);
    if (!resolved) {
      console.error("No user found for email %s", args.email);
      process.exit(2);
    }
    uid = resolved;
    console.log("[findTodo] resolved email %s → uid %s", args.email, uid);
  }
  if (!uid) process.exit(1);

  const needle = args.q.toLowerCase();
  const todos = await readUserTodos(db, uid);
  const total = Object.keys(todos).length;
  console.log("[findTodo] %d todo(s) total for uid %s (shard %d)", total, uid, todoShardIndex(uid));

  const hits: Hit[] = [];
  for (const [id, row] of Object.entries(todos)) {
    if (!matches(row, needle)) continue;
    const status = typeof row.status === "string" ? row.status : "";
    if (!args.includeActive && status === "active") continue;
    hits.push(toHit(uid, id, row));
    if (hits.length >= args.limit) break;
  }

  if (hits.length === 0) {
    console.log("[findTodo] no match for q=%j (archived only: %s)", args.q, !args.includeActive);
    return;
  }

  console.log("[findTodo] %d hit(s):", hits.length);
  for (const h of hits) {
    console.log(
      "  - id=%s  status=%s  statusChangedAt=%s  parentId=%s  projectId=%s  assignedTo=%s  title=%j",
      h.todoId, h.status, h.statusChangedAt ?? "-", h.parentId ?? "-", h.projectId ?? "-", h.assignedTo ?? "-", h.title
    );
  }
}

main().catch((err) => {
  console.error("[findTodo] fatal:", err);
  process.exit(99);
});
