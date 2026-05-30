import path from "path";

export const repoRoot = path.resolve(__dirname, "..", "..");

export const apiBase = (process.env.E2E_API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

export const localStorePath = path.join(repoRoot, "backend", "data", "local-store.json");
