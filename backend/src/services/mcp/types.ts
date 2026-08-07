import { apiKeyHasScope, type ApiKeyScope, type AuthUser } from "../authService";
import { ForbiddenError, ValidationError } from "../../utils/errors";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: ApiKeyScope;
}

export type McpToolHandler = (
  user: AuthUser,
  args: Record<string, unknown>,
) => Promise<unknown> | unknown;

export function assertMcpScope(scopes: ApiKeyScope[], needed: ApiKeyScope): void {
  if (!apiKeyHasScope(scopes, needed)) {
    throw new ForbiddenError(`Scope requis: ${needed}`, "API_KEY_SCOPE");
  }
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new ValidationError(`${key} requis`);
  }
  return v.trim();
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function clampLimit(raw: unknown, fallback = 50, max = 200): number {
  const n = typeof raw === "number" ? raw : fallback;
  return Math.min(max, Math.max(1, Math.floor(n)));
}
