import dotenv from "dotenv";
dotenv.config();

import http from "http";
import {
  initStore,
  flushNow,
  attachLiveInvalidation,
  detachLiveInvalidation,
  startWatchdogFlush,
  stopWatchdogFlush,
} from "./persistence";

const port = Number(process.env.PORT) || 3000;
let server: http.Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — shutting down`);

  if (server) {
    server.close();
  }

  try {
    const { stopReminderJob } = await import("./services/reminderService");
    stopReminderJob();
  } catch { /* not started yet */ }
  try {
    const { stopTodosDriftMonitor } = await import("./services/todosDriftMonitor");
    stopTodosDriftMonitor();
  } catch { /* not started yet */ }

  stopWatchdogFlush();
  detachLiveInvalidation();
  try {
    await flushNow();
    console.log("[server] Store flushed, exiting cleanly");
  } catch (err) {
    console.error("[server] Flush error during shutdown:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

/**
 * Safety net for crashes that bypass SIGTERM (uncaught throw, unhandled
 * rejection). We try a best-effort flush — bounded to ~3 s so we don't hang
 * Cloud Run during its 10 s grace period — then exit with code 1.
 *
 * Why: before this handler, an uncaught exception would terminate the process
 * immediately and any unwritten in-memory mutation (debounced 500 ms write,
 * pending watchdog tick) was lost. Empirically this is what caused the May
 * 2026 "tâches v2 sans pendant legacy" drift on prod (see ROADMAP notes).
 */
async function crashFlushAndExit(label: string, err: unknown): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[server] ${label}:`, err);
  stopWatchdogFlush();
  detachLiveInvalidation();
  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 3_000));
  try {
    await Promise.race([flushNow(), timeoutPromise]);
    console.error("[server] crash flush completed (best effort)");
  } catch (flushErr) {
    console.error("[server] crash flush failed:", flushErr);
  }
  process.exit(1);
}

process.on("uncaughtException", (err) => { void crashFlushAndExit("uncaughtException", err); });
process.on("unhandledRejection", (reason) => { void crashFlushAndExit("unhandledRejection", reason); });

async function main(): Promise<void> {
  await initStore();
  const { hydrateTodosFromLegacyStore, hydrateTodosFromV2IfNeeded } = await import("./services/todoService");
  // In v2 mode the legacy `store/todos_*` shards are no longer the source of
  // truth (and Phase 2 cleanup will delete them). Skip the legacy hydration —
  // hydrateTodosFromV2IfNeeded loads everything we need from `todos_v2`.
  const todosStorageMode = (process.env.TODOS_STORAGE_MODE?.trim().toLowerCase() ?? "legacy");
  if (todosStorageMode !== "v2") {
    hydrateTodosFromLegacyStore();
  }
  await hydrateTodosFromV2IfNeeded();
  // Attach cross-replica cache invalidation AFTER hydration so that the initial
  // onSnapshot calls (which would replay existing data) are safely skipped.
  attachLiveInvalidation();

  if (process.env.NODE_ENV === "production" && !process.env.OAUTH_STATE_SECRET?.trim()) {
    console.error("[server] OAUTH_STATE_SECRET is required in production (Calendar OAuth + Google SSO state signing)");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production" && !process.env.ALLOWED_ORIGINS?.trim()) {
    console.error("[server] ALLOWED_ORIGINS is required in production (CORS for the web app origin)");
    process.exit(1);
  }

  const useLocal = process.env.USE_LOCAL_STORE === "true";
  if (process.env.NODE_ENV === "production" && !useLocal && !process.env.GOOGLE_CLOUD_PROJECT?.trim()) {
    console.error("[server] GOOGLE_CLOUD_PROJECT is required in production when not using USE_LOCAL_STORE=true");
    process.exit(1);
  }

  const { default: app } = await import("./app");
  const { startReminderJob } = await import("./services/reminderService");
  const { startTodosDriftMonitor } = await import("./services/todosDriftMonitor");

  server = app.listen(port, () => {
    console.log(`[server] Backend listening on port ${port}`);
    startReminderJob();
    startTodosDriftMonitor();
    // 5 s safety-net flush: in addition to the 500 ms debounce, force a write
    // if anything sits dirty. Prevents the "debounce starve" case where a
    // continuous stream of writes keeps re-arming the timer.
    startWatchdogFlush(5_000);
  });
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
