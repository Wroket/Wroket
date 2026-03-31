/**
 * Minimal structured logger.
 *
 * Why: the codebase has ~48 bare console.log/error/warn calls scattered
 * across services. Bare console output has no timestamp, no severity field,
 * and no machine-readable structure — making it hard to filter in Cloud
 * Logging or set up alerts. This drop-in logger:
 *
 *   • Outputs JSON lines in production (easy to parse by Cloud Logging /
 *     Datadog / any log aggregator)
 *   • Outputs human-readable lines in dev
 *   • Attaches ISO timestamp and severity to every entry
 *   • Accepts an optional `meta` bag for structured context (requestId,
 *     userId, domain, …)
 *
 * No external dependency — uses Node's built-in console under the hood.
 *
 * Usage:
 *   import { logger } from "../utils/logger";
 *   logger.info("[auth] user logged in", { uid });
 *   logger.error("[persistence] save failed", { domain, error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const IS_PROD = process.env.NODE_ENV === "production";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const now = new Date().toISOString();

  if (IS_PROD) {
    // JSON line — Cloud Logging recognises `severity` and `time` automatically
    const entry: Record<string, unknown> = { severity: level.toUpperCase(), time: now, message };
    if (meta) Object.assign(entry, meta);
    const out = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      console.error(out);
    } else {
      console.log(out);
    }
  } else {
    const prefix = `[${now}] [${level.toUpperCase().padEnd(5)}]`;
    const metaStr = meta && Object.keys(meta).length > 0 ? `  ${JSON.stringify(meta)}` : "";
    const line = `${prefix} ${message}${metaStr}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info:  (message: string, meta?: Record<string, unknown>) => emit("info",  message, meta),
  warn:  (message: string, meta?: Record<string, unknown>) => emit("warn",  message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
