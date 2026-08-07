import type { Response } from "express";

import type { ApiKeyAuthenticatedRequest } from "../middlewares/requireApiKey";
import { executeMcpTool, MCP_TOOL_DEFS } from "../services/mcpTools";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "wroket", version: "1.0.0" };

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

function rpcResult(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcId | undefined, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function toolResultContent(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

async function handleOne(
  req: ApiKeyAuthenticatedRequest,
  message: JsonRpcRequest,
): Promise<Record<string, unknown> | null> {
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id;
  const isNotification = id === undefined;

  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return null;
  }

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === "ping") {
    return rpcResult(id, {});
  }

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: MCP_TOOL_DEFS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
    const name = typeof params.name === "string" ? params.name : "";
    const args =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};

    const scopes = req.apiKeyScopes ?? [];
    const keyId = req.apiKeyId ?? "?";
    const uid = req.user!.uid;

    try {
      const payload = await executeMcpTool(req.user!, scopes, name, args);
      logger.info("[mcp] tool ok", { tool: name, keyId, uid });
      return rpcResult(id, toolResultContent(payload, false));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof AppError ? err.code : undefined;
      logger.warn("[mcp] tool fail", { tool: name, keyId, uid, ok: false, code, message: msg });
      const statusHint = err instanceof AppError ? err.statusCode : 500;
      return rpcResult(
        id,
        toolResultContent(
          { error: msg, code: code ?? "MCP_TOOL_ERROR", status: statusHint },
          true,
        ),
      );
    }
  }

  if (isNotification) return null;
  return rpcError(id, -32601, `Method not found: ${method}`);
}

/**
 * MCP Streamable HTTP (JSON-RPC) — POST body is one request or an array.
 */
export async function handleMcpPost(req: ApiKeyAuthenticatedRequest, res: Response): Promise<void> {
  const body = req.body;

  if (Array.isArray(body)) {
    const out: Record<string, unknown>[] = [];
    for (const item of body) {
      if (!item || typeof item !== "object") continue;
      const r = await handleOne(req, item as JsonRpcRequest);
      if (r) out.push(r);
    }
    if (out.length === 0) {
      res.status(202).end();
      return;
    }
    res.status(200).json(out.length === 1 ? out[0] : out);
    return;
  }

  if (!body || typeof body !== "object") {
    res.status(400).json(rpcError(null, -32700, "Parse error"));
    return;
  }

  const result = await handleOne(req, body as JsonRpcRequest);
  if (!result) {
    res.status(202).end();
    return;
  }
  res.status(200).json(result);
}

/** Discovery / health for agents probing the endpoint. */
export function handleMcpGet(_req: ApiKeyAuthenticatedRequest, res: Response): void {
  res.status(200).json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http",
    tools: MCP_TOOL_DEFS.map((t) => t.name),
  });
}
