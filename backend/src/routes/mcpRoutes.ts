import { Router } from "express";
import rateLimit from "express-rate-limit";

import { handleMcpGet, handleMcpPost } from "../controllers/mcpController";
import { requireApiKey, type ApiKeyAuthenticatedRequest } from "../middlewares/requireApiKey";
import { requireProductAccess } from "../middlewares/requireProductAccess";

const mcpKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const r = req as ApiKeyAuthenticatedRequest;
    return r.apiKeyId ? `mcp:${r.apiKeyId}` : `mcp-ip:${req.ip}`;
  },
  message: { message: "Trop de requêtes MCP, réessayez dans une minute", code: "MCP_RATE_LIMIT" },
});

const mcpRoutes = Router();

// Public metadata & Streamable HTTP GET probe (405 on Accept: text/event-stream, 200 JSON otherwise).
mcpRoutes.get("/", handleMcpGet);

// Authenticated JSON-RPC endpoint (tools/list, tools/call, prompts/list, prompts/get).
mcpRoutes.post("/", requireApiKey, requireProductAccess, mcpKeyLimiter, handleMcpPost);

export default mcpRoutes;
