/**
 * Photo → workflow graph. Distinct from Cloud Vision OCR, which only returns text.
 * Off unless `DIAGRAM_ENABLED=true`. The image and the model output are not logged.
 */
import { getGcpAccessToken } from "./gcpAccessToken";
import { getEffectiveEntitlementsForUid } from "./teamService";
import { vertexFailureReason } from "./vertexHttp";
import type { NoteDiagramEdge, NoteDiagramNode } from "./noteService";
import { AppError, UnprocessableEntityError } from "../utils/errors";
import { logger } from "../utils/logger";

const DEFAULT_DAILY_LIMIT = 5;
const MAX_NODES = 25;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const SHAPES = new Set(["rect", "round", "ellipse", "diamond"]);
const COLORS = new Set(["emerald", "sky", "amber", "rose", "violet", "zinc"]);
const MAX_ASIDE = 4000;

export interface DiagramProposal {
  nodes: NoteDiagramNode[];
  edges: NoteDiagramEdge[];
  /** Text written outside the boxes. Empty when the page has none. */
  aside?: string;
  /** `mock` does not read the photo. The client should not present those labels as recognized steps. */
  provider?: "mock" | "vertex";
}

const usage = new Map<string, { day: string; count: number }>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailyLimit(): number {
  const raw = Number(process.env.DIAGRAM_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_LIMIT;
}

/** True when the kill switch is on and the user has the work-capture entitlement. */
export function isDiagramEnabledFor(uid: string | undefined, email: string | undefined): boolean {
  if (process.env.DIAGRAM_ENABLED !== "true") return false;
  if (!uid) return false;
  return getEffectiveEntitlementsForUid(uid, email ?? "").workCapture;
}

export function assertDiagramEnabledFor(uid: string | undefined, email: string | undefined): void {
  if (!isDiagramEnabledFor(uid, email)) {
    throw new AppError(503, "La lecture de schémas n'est pas activée pour ce compte", "DIAGRAM_DISABLED");
  }
}

function usedToday(uid: string): number {
  const entry = usage.get(uid);
  return entry && entry.day === today() ? entry.count : 0;
}

function consumeQuota(uid: string): void {
  const limit = dailyLimit();
  const used = usedToday(uid);
  if (used >= limit) {
    throw new AppError(429, `Limite quotidienne de schémas atteinte (${limit})`, "DIAGRAM_QUOTA_EXCEEDED");
  }
  usage.set(uid, { day: today(), count: used + 1 });
}

function refundQuota(uid: string): void {
  const entry = usage.get(uid);
  if (entry && entry.day === today() && entry.count > 0) entry.count -= 1;
}

export function getDiagramConfigFor(uid: string, email: string | undefined): {
  enabled: boolean;
  dailyLimit: number;
  remaining: number;
} {
  const enabled = isDiagramEnabledFor(uid, email);
  const limit = dailyLimit();
  return { enabled, dailyLimit: limit, remaining: enabled ? Math.max(0, limit - usedToday(uid)) : 0 };
}

/** Test hook. */
export function __resetDiagramQuota(): void {
  usage.clear();
}

function unitFraction(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function safeId(raw: string, fallback: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return cleaned || fallback;
}

function sanitizeAside(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, MAX_ASIDE);
}

/**
 * Keep a model graph inside the product limits. Drops edges that point nowhere.
 */
export function sanitizeDiagramProposal(raw: unknown): DiagramProposal {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nodesIn = Array.isArray(obj.nodes) ? obj.nodes : [];
  const nodes: NoteDiagramNode[] = [];
  const seen = new Set<string>();
  for (const item of nodesIn) {
    if (nodes.length >= MAX_NODES) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 200) : "";
    if (!label) continue;
    const id = safeId(typeof row.id === "string" ? row.id : "", `n${nodes.length + 1}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const column = typeof row.column === "string" ? row.column.trim().slice(0, 80) : "";
    const x = unitFraction(row.x);
    const y = unitFraction(row.y);
    const w = unitFraction(row.w);
    const h = unitFraction(row.h);
    const box = x !== undefined && y !== undefined && w !== undefined && h !== undefined && w >= 0.03 && h >= 0.03
      ? { x, y, w, h }
      : {};
    const shape = typeof row.shape === "string" && SHAPES.has(row.shape) ? row.shape as NoteDiagramNode["shape"] : undefined;
    const color = typeof row.color === "string" && COLORS.has(row.color) ? row.color as NoteDiagramNode["color"] : undefined;
    nodes.push({
      id,
      label,
      ...(column ? { column } : {}),
      ...box,
      ...(shape ? { shape } : {}),
      ...(color ? { color } : {}),
    });
  }
  const edges: NoteDiagramEdge[] = [];
  const edgeSeen = new Set<string>();
  const edgesIn = Array.isArray(obj.edges) ? obj.edges : [];
  for (const item of edgesIn) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const from = safeId(typeof row.from === "string" ? row.from : "", "");
    const to = safeId(typeof row.to === "string" ? row.to : "", "");
    if (!from || !to || from === to || !seen.has(from) || !seen.has(to)) continue;
    const key = `${from}>${to}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({ from, to });
  }
  return { nodes, edges, aside: sanitizeAside(obj.aside) };
}

function mockProposal(): DiagramProposal {
  return sanitizeDiagramProposal({
    nodes: [
      { id: "n1", label: "Étape 1" },
      { id: "n2", label: "Étape 2", column: "Suite" },
    ],
    edges: [{ from: "n1", to: "n2" }],
  });
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(trimmed) as unknown;
}

async function vertexProposal(buffer: Buffer, mimeType: string): Promise<DiagramProposal> {
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCLOUD_PROJECT?.trim();
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT missing");
  const location = process.env.DIAGRAM_VERTEX_LOCATION?.trim() || "global";
  const model = process.env.DIAGRAM_VERTEX_MODEL?.trim() || "gemini-3-flash-preview";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url =
    `https://${host}/v1/projects/${encodeURIComponent(project)}` +
    `/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const token = await getGcpAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              text: "Extract the workflow drawn in this image. Reply with JSON only: {\"nodes\":[{\"id\":\"n1\",\"label\":\"words in the box\",\"column\":\"optional lane\",\"shape\":\"rect\",\"color\":\"emerald\",\"x\":0.1,\"y\":0.2,\"w\":0.2,\"h\":0.15}],\"edges\":[{\"from\":\"n1\",\"to\":\"n2\"}],\"aside\":\"\"}. x,y,w,h are fractions of the image from 0 to 1. shape is rect, round, ellipse or diamond. color is emerald, sky, amber, rose, violet or zinc. aside is the text written outside the boxes, in reading order, without repeating the box labels; use an empty string when there is none. Max 25 nodes. Do not invent steps or text. If there is no diagram, return {\"nodes\":[],\"edges\":[],\"aside\":\"\"}.",
            },
            { inlineData: { mimeType, data: buffer.toString("base64") } },
          ],
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          // Default thinking is HIGH and can sit past 45s on a photo. LOW is enough to copy boxes.
          thinkingConfig: { thinkingLevel: "LOW" },
        },
      }),
    });
    if (!res.ok) throw new Error(await vertexFailureReason(res));
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new Error("empty model response");
    return sanitizeDiagramProposal(extractJson(text));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Propose a graph from an image. Nothing is stored.
 * @throws AppError DIAGRAM_DISABLED, DIAGRAM_QUOTA_EXCEEDED, DIAGRAM_PROVIDER_ERROR
 */
export async function proposeDiagramForUser(input: {
  uid: string;
  email: string | undefined;
  buffer: Buffer;
  mimeType: string;
  requestId?: string;
}): Promise<DiagramProposal> {
  assertDiagramEnabledFor(input.uid, input.email);
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new UnprocessableEntityError("Utiliser une image JPEG, PNG, WebP ou GIF", "DIAGRAM_UNSUPPORTED_TYPE");
  }
  consumeQuota(input.uid);
  const started = Date.now();
  const provider = (process.env.DIAGRAM_PROVIDER ?? "vertex").trim().toLowerCase();
  try {
    const proposal = provider === "mock" ? mockProposal() : await vertexProposal(input.buffer, input.mimeType);
    proposal.provider = provider === "mock" ? "mock" : "vertex";
    logger.info("diagram.ok", {
      requestId: input.requestId,
      uid: input.uid,
      ms: Date.now() - started,
      nodes: proposal.nodes.length,
      edges: proposal.edges.length,
    });
    return proposal;
  } catch (err) {
    refundQuota(input.uid);
    if (err instanceof AppError) throw err;
    if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
      logger.warn("diagram.timeout", {
        requestId: input.requestId,
        uid: input.uid,
        ms: Date.now() - started,
      });
      throw new AppError(504, "Lecture du schéma trop longue", "DIAGRAM_TIMEOUT");
    }
    logger.warn("diagram.provider_error", {
      requestId: input.requestId,
      uid: input.uid,
      ms: Date.now() - started,
      reason: err instanceof Error ? err.message : "unknown",
    });
    throw new AppError(502, "Lecture du schéma indisponible", "DIAGRAM_PROVIDER_ERROR");
  }
}
