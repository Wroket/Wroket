import path from "path";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "..");

/**
 * Smoke E2E — pas de secrets.
 * - E2E_BASE_URL : frontend (défaut http://localhost:3000 — préféré à 127.0.0.1 sous Windows / Next)
 * - E2E_API_BASE_URL : API (défaut http://localhost:3001)
 * - E2E_SKIP_WEBSERVER=1 : ne pas lancer `npm run dev` (recommandé si timeout : lance le stack à la main)
 * - E2E_WEBSERVER_TIMEOUT_MS : surcharge du délai d’attente du serveur (première compile Next peut dépasser 3 min)
 */
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "1" || process.env.E2E_SKIP_WEBSERVER === "true";

const defaultBaseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const apiBase = (process.env.E2E_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const apiHealthUrl = `${apiBase}/health`;
const webServerTimeoutMs = (() => {
  const raw = process.env.E2E_WEBSERVER_TIMEOUT_MS;
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return process.env.CI ? 360_000 : 420_000;
})();

const reuseDevServer = !process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : "list",
  timeout: 30_000,
  use: {
    baseURL: defaultBaseUrl,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /**
   * Wait for API + UI: a single `concurrently` dev script can expose :3000 before :3001 is ready,
   * which flakes the API smoke test. Two webServers each wait on their own readiness URL.
   */
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: "npm run dev --prefix backend",
          cwd: repoRoot,
          url: apiHealthUrl,
          timeout: webServerTimeoutMs,
          reuseExistingServer: reuseDevServer,
        },
        {
          command: "npm run dev --prefix frontend",
          cwd: repoRoot,
          url: defaultBaseUrl,
          timeout: webServerTimeoutMs,
          reuseExistingServer: reuseDevServer,
        },
      ],
});
