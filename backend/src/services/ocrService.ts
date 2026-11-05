/**
 * OCR service — image → plain text (POC « photo vers note »).
 *
 * Providers:
 *   - `vision`: Google Cloud Vision `DOCUMENT_TEXT_DETECTION`, EU endpoint, REST + SA token.
 *   - `mock`:   deterministic fake text (tests, local dev).
 *
 * Guard rails: feature flag `OCR_ENABLED`, optional allowlist `OCR_BETA_EMAILS`
 * (separated by `,` or `;`), per-user daily quota (in-memory, per instance).
 * The recognized text is never logged.
 */
import { AppError, UnprocessableEntityError } from "../utils/errors";
import { logger } from "../utils/logger";
import { getGcpAccessToken } from "./gcpAccessToken";

export const OCR_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export const OCR_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_DAILY_LIMIT = 20;
const VISION_ENDPOINT = "https://eu-vision.googleapis.com/v1/images:annotate";
const VISION_TIMEOUT_MS = 15_000;
const MAX_DETECTED_LANGUAGES = 3;
const LANGUAGE_HINT_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export type OcrSource = "device" | "camera" | "drop" | "paste" | "gdrive" | "dropbox" | "attachment";
const OCR_SOURCES: ReadonlySet<string> = new Set<OcrSource>([
  "device", "camera", "drop", "paste", "gdrive", "dropbox", "attachment",
]);

export interface DetectedLanguage {
  code: string;
  confidence: number;
}

export interface OcrResult {
  text: string;
  detectedLanguages: DetectedLanguage[];
  /** Set to `OCR_NO_TEXT` when the provider returned no text (HTTP 200). */
  code?: "OCR_NO_TEXT";
}

export interface OcrProvider {
  readonly name: string;
  recognize(image: Buffer, options: { languageHint?: string }): Promise<Omit<OcrResult, "code">>;
}

export interface OcrConfig {
  enabled: boolean;
  dailyLimit: number;
  remaining: number;
}

/** Provider failure (network, quota GCP, auth) — mapped to 502 by the service. */
export class OcrProviderFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrProviderFailure";
  }
}

// ---- Configuration ----

function dailyLimit(): number {
  const raw = Number(process.env.OCR_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_DAILY_LIMIT;
}

function betaAllowlist(): Set<string> {
  return new Set(
    (process.env.OCR_BETA_EMAILS ?? "")
      .split(/[,;]/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True when the flag is on and the user is in the allowlist (empty allowlist = everyone). */
export function isOcrEnabledFor(email: string | undefined): boolean {
  if (process.env.OCR_ENABLED !== "true") return false;
  const allow = betaAllowlist();
  if (allow.size === 0) return true;
  return !!email && allow.has(email.trim().toLowerCase());
}

/** @throws AppError `OCR_DISABLED` (503) when OCR is off for this user. */
export function assertOcrEnabledFor(email: string | undefined): void {
  if (!isOcrEnabledFor(email)) {
    throw new AppError(503, "La reconnaissance de texte n'est pas activée pour ce compte", "OCR_DISABLED");
  }
}

// ---- Quota (in-memory, per instance) ----

const usage = new Map<string, { day: string; count: number }>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function usedToday(uid: string): number {
  const entry = usage.get(uid);
  return entry && entry.day === today() ? entry.count : 0;
}

function consumeQuota(uid: string): void {
  const limit = dailyLimit();
  const used = usedToday(uid);
  if (used >= limit) {
    throw new AppError(429, `Limite quotidienne d'OCR atteinte (${limit})`, "OCR_QUOTA_EXCEEDED");
  }
  usage.set(uid, { day: today(), count: used + 1 });
}

function refundQuota(uid: string): void {
  const entry = usage.get(uid);
  if (entry && entry.day === today() && entry.count > 0) entry.count -= 1;
}

/** Public config for the client (flag + remaining quota). */
export function getOcrConfigFor(uid: string, email: string | undefined): OcrConfig {
  const enabled = isOcrEnabledFor(email);
  const limit = dailyLimit();
  return { enabled, dailyLimit: limit, remaining: enabled ? Math.max(0, limit - usedToday(uid)) : 0 };
}

// ---- Validation ----

/**
 * Normalize an optional BCP-47 short language hint (`fr`, `zh-Hant`, `pt-BR`).
 * Empty / "auto" → undefined.
 * @throws UnprocessableEntityError `OCR_INVALID_LANGUAGE`
 */
export function normalizeLanguageHint(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") {
    throw new UnprocessableEntityError("Langue invalide", "OCR_INVALID_LANGUAGE");
  }
  const value = raw.trim();
  if (!value || value.toLowerCase() === "auto") return undefined;
  if (!LANGUAGE_HINT_RE.test(value)) {
    throw new UnprocessableEntityError("Langue invalide", "OCR_INVALID_LANGUAGE", { languageHint: value });
  }
  return value;
}

/** Normalize the optional client-reported source (used for logs only). */
export function normalizeOcrSource(raw: unknown): OcrSource | undefined {
  return typeof raw === "string" && OCR_SOURCES.has(raw) ? (raw as OcrSource) : undefined;
}

// ---- Providers ----

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionSymbol {
  text?: string;
  property?: { detectedBreak?: { type?: string } };
}

interface VisionWord {
  symbols?: VisionSymbol[];
  boundingBox?: { vertices?: VisionVertex[] };
}

interface VisionParagraph {
  words?: VisionWord[];
}

interface VisionBlock {
  paragraphs?: VisionParagraph[];
}

interface VisionPage {
  property?: { detectedLanguages?: Array<{ languageCode?: string; confidence?: number }> };
  blocks?: VisionBlock[];
}

interface VisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: {
      text?: string;
      pages?: VisionPage[];
    };
    error?: { code?: number; message?: string };
  }>;
}

interface WordBox {
  text: string;
  cx: number;
  cy: number;
  height: number;
}

/** Center + height of a Vision bounding polygon (missing coords treated as 0). */
function wordGeometry(vertices: VisionVertex[] | undefined): Omit<WordBox, "text"> | null {
  if (!vertices || vertices.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    const x = v.x ?? 0;
    const y = v.y ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const height = Math.max(1, maxY - minY);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, height };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Rebuild plain text by clustering Vision words on Y then sorting by X.
 * Fixes DOCUMENT_TEXT_DETECTION reading-order bugs on sparse handwriting
 * (words from different physical lines interleaved / one word per line).
 */
export function reconstructTextFromPages(pages: VisionPage[]): string {
  const words: WordBox[] = [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = (word.symbols ?? []).map((s) => s.text ?? "").join("");
          if (!text) continue;
          const geo = wordGeometry(word.boundingBox?.vertices);
          if (!geo) continue;
          words.push({ text, ...geo });
        }
      }
    }
  }
  if (words.length === 0) return "";

  words.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const medH = median(words.map((w) => w.height)) || 12;
  const lineThreshold = Math.max(8, medH * 0.65);

  const lines: WordBox[][] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current) {
      lines.push([word]);
      continue;
    }
    const avgY = current.reduce((sum, w) => sum + w.cy, 0) / current.length;
    if (Math.abs(word.cy - avgY) <= lineThreshold) current.push(word);
    else lines.push([word]);
  }

  for (const line of lines) line.sort((a, b) => a.cx - b.cx);

  // Only treat clearly larger gaps as paragraph breaks (blank line on the board).
  const paraThreshold = Math.max(20, medH * 2.6);
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i > 0) {
      const prev = lines[i - 1]!;
      const prevY = prev.reduce((sum, w) => sum + w.cy, 0) / prev.length;
      const currY = line.reduce((sum, w) => sum + w.cy, 0) / line.length;
      parts.push(currY - prevY > paraThreshold ? "\n\n" : "\n");
    }
    parts.push(line.map((w) => w.text).join(" "));
  }
  return parts.join("").trim();
}

/**
 * Extract text + detected languages from a Vision `images:annotate` response.
 * Prefers geometry-based reconstruction when word boxes exist.
 * @throws OcrProviderFailure when the per-image response carries an error.
 */
export function parseVisionResponse(body: VisionAnnotateResponse): Omit<OcrResult, "code"> {
  const first = body.responses?.[0];
  if (!first) return { text: "", detectedLanguages: [] };
  if (first.error?.message) throw new OcrProviderFailure(`vision: ${first.error.message}`);

  const pages = first.fullTextAnnotation?.pages ?? [];
  const best = new Map<string, number>();
  for (const page of pages) {
    for (const lang of page.property?.detectedLanguages ?? []) {
      if (!lang.languageCode) continue;
      const confidence = typeof lang.confidence === "number" ? lang.confidence : 0;
      best.set(lang.languageCode, Math.max(best.get(lang.languageCode) ?? 0, confidence));
    }
  }
  const detectedLanguages = [...best.entries()]
    .map(([code, confidence]) => ({ code, confidence: Math.round(confidence * 100) / 100 }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_DETECTED_LANGUAGES);

  const rebuilt = reconstructTextFromPages(pages);
  const fallback = (first.fullTextAnnotation?.text ?? "").trim();
  return { text: rebuilt || fallback, detectedLanguages };
}

const visionProvider: OcrProvider = {
  name: "vision",
  async recognize(image, { languageHint }) {
    let token: string;
    try {
      token = await getGcpAccessToken();
    } catch (err) {
      throw new OcrProviderFailure(err instanceof Error ? err.message : "token unavailable");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
    try {
      const res = await fetch(VISION_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: image.toString("base64") },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              // languageHints bias script/lexicon (critical for FR handwriting vs Cyrillic misfires).
              ...(languageHint
                ? { imageContext: { languageHints: [languageHint] } }
                : {}),
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new OcrProviderFailure(`vision HTTP ${res.status}: ${detail.slice(0, 200)}`);
      }
      return parseVisionResponse((await res.json()) as VisionAnnotateResponse);
    } catch (err) {
      if (err instanceof OcrProviderFailure) throw err;
      throw new OcrProviderFailure(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  },
};

const mockProvider: OcrProvider = {
  name: "mock",
  async recognize(image, { languageHint }) {
    if (image.length === 0) return { text: "", detectedLanguages: [] };
    return {
      text: "Texte reconnu (mock)\nDeuxième ligne",
      detectedLanguages: [{ code: languageHint ?? "fr", confidence: 0.99 }],
    };
  },
};

let providerOverride: OcrProvider | null = null;

/** Test helper: force a provider (null = env-based selection). */
export function __setOcrProviderForTests(provider: OcrProvider | null): void {
  providerOverride = provider;
}

/** Test helper: clear the in-memory quota. */
export function __resetOcrQuota(): void {
  usage.clear();
}

function resolveProvider(): OcrProvider {
  if (providerOverride) return providerOverride;
  const configured = process.env.OCR_PROVIDER?.trim().toLowerCase();
  if (configured === "vision") return visionProvider;
  if (configured === "mock") return mockProvider;
  return process.env.NODE_ENV === "production" ? visionProvider : mockProvider;
}

// ---- Public API ----

export interface RecognizeImageInput {
  uid: string;
  email: string | undefined;
  buffer: Buffer;
  mimeType: string;
  languageHint?: string;
  source?: OcrSource;
  requestId?: string;
}

/**
 * Run OCR for a user after flag, format and quota checks.
 * @throws AppError `OCR_DISABLED` (503), `OCR_UNSUPPORTED_TYPE` (422),
 *   `OCR_QUOTA_EXCEEDED` (429), `OCR_PROVIDER_ERROR` (502)
 */
export async function recognizeImageForUser(input: RecognizeImageInput): Promise<OcrResult> {
  assertOcrEnabledFor(input.email);
  if (!OCR_ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new UnprocessableEntityError("Format d'image non pris en charge", "OCR_UNSUPPORTED_TYPE", {
      mimeType: input.mimeType,
      allowed: [...OCR_ALLOWED_MIME_TYPES],
    });
  }
  if (input.buffer.length === 0 || input.buffer.length > OCR_MAX_IMAGE_BYTES) {
    throw new UnprocessableEntityError("Image vide ou trop volumineuse (max 5 Mo)", "OCR_UNSUPPORTED_TYPE", {
      size: input.buffer.length,
    });
  }

  consumeQuota(input.uid);
  const provider = resolveProvider();
  const startedAt = Date.now();
  try {
    const result = await provider.recognize(input.buffer, { languageHint: input.languageHint });
    logger.info("[ocr] recognized", {
      requestId: input.requestId,
      uid: input.uid,
      provider: provider.name,
      source: input.source,
      size: input.buffer.length,
      durationMs: Date.now() - startedAt,
      chars: result.text.length,
      detectedLanguage: result.detectedLanguages[0]?.code,
      languageHint: input.languageHint,
    });
    if (!result.text) return { ...result, text: "", code: "OCR_NO_TEXT" };
    return result;
  } catch (err) {
    refundQuota(input.uid);
    logger.error("[ocr] provider failure", {
      requestId: input.requestId,
      uid: input.uid,
      provider: provider.name,
      source: input.source,
      size: input.buffer.length,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError(502, "Le service de reconnaissance de texte est momentanément indisponible", "OCR_PROVIDER_ERROR");
  }
}
