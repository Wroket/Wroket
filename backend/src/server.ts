import dotenv from "dotenv";
dotenv.config();

import { initStore, flushNow } from "./persistence";

const port = Number(process.env.PORT) || 3000;

/**
 * Graceful shutdown handler.
 *
 * Why: scheduleSave() debounces writes by 500 ms to batch Firestore commits.
 * If the process is killed (SIGTERM from Cloud Run, Ctrl-C in dev) between a
 * write and the debounce firing, the last mutation is silently lost.
 *
 * Cloud Run sends SIGTERM and gives the container up to the configured
 * termination grace period (default 10 s) to finish. Calling flushNow()
 * drains the debounce queue synchronously (local) or awaits the Firestore
 * batch before exiting, keeping the store consistent across deploys.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} received — flushing store and exiting`);
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

async function main(): Promise<void> {
  await initStore();

  const { default: app } = await import("./app");

  const { startReminderJob } = await import("./services/reminderService");

  app.listen(port, () => {
    console.log(`[server] Backend listening on port ${port}`);
    startReminderJob();
  });
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
