import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { initStore, flushNow } from "./persistence";

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

  server = app.listen(port, () => {
    console.log(`[server] Backend listening on port ${port}`);
    startReminderJob();
  });
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
