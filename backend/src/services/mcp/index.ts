import type { ApiKeyScope, AuthUser } from "../authService";
import { ValidationError } from "../../utils/errors";
import { calendarHandlers, calendarToolDefs } from "./calendar";
import { commentHandlers, commentToolDefs } from "./comments";
import { noteHandlers, noteToolDefs } from "./notes";
import { projectHandlers, projectToolDefs } from "./projects";
import { todoHandlers, todoToolDefs } from "./todos";
import { assertMcpScope, type McpToolDef, type McpToolHandler } from "./types";

export type { McpToolDef } from "./types";

export const MCP_TOOL_DEFS: McpToolDef[] = [
  ...todoToolDefs,
  ...projectToolDefs,
  ...noteToolDefs,
  ...commentToolDefs,
  ...calendarToolDefs,
];

const HANDLERS: Record<string, McpToolHandler> = {
  ...todoHandlers,
  ...projectHandlers,
  ...noteHandlers,
  ...commentHandlers,
  ...calendarHandlers,
};

/**
 * Execute one MCP tool; returns a JSON-serializable payload for the agent.
 */
export async function executeMcpTool(
  user: AuthUser,
  scopes: ApiKeyScope[],
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const def = MCP_TOOL_DEFS.find((d) => d.name === name);
  if (!def) throw new ValidationError(`Outil inconnu: ${name}`, "MCP_UNKNOWN_TOOL");
  assertMcpScope(scopes, def.requiredScope);

  const handler = HANDLERS[name];
  if (!handler) throw new ValidationError(`Outil inconnu: ${name}`, "MCP_UNKNOWN_TOOL");
  return handler(user, args);
}
