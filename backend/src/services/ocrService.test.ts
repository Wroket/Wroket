import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetOcrQuota,
  __setOcrProviderForTests,
  getOcrConfigFor,
  isOcrEnabledFor,
  normalizeLanguageHint,
  normalizeOcrSource,
  OcrProviderFailure,
  parseVisionResponse,
  recognizeImageForUser,
  reconstructTextFromPages,
  type OcrProvider,
} from "./ocrService";

const ENV_KEYS = ["OCR_ENABLED", "OCR_BETA_EMAILS", "OCR_DAILY_LIMIT", "OCR_PROVIDER"] as const;
const savedEnv: Record<string, string | undefined> = {};

const okProvider: OcrProvider = {
  name: "test",
  async recognize(_image, { languageHint }) {
    return { text: "Bonjour\nmonde", detectedLanguages: [{ code: languageHint ?? "fr", confidence: 0.9 }] };
  },
};

function jpeg(size = 10): Buffer {
  return Buffer.alloc(size, 1);
}

function input(overrides: Partial<Parameters<typeof recognizeImageForUser>[0]> = {}) {
  return {
    uid: "u1",
    email: "a@test.com",
    buffer: jpeg(),
    mimeType: "image/jpeg",
    ...overrides,
  };
}

async function expectCode(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ statusCode: status, code });
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.OCR_ENABLED = "true";
  delete process.env.OCR_BETA_EMAILS;
  delete process.env.OCR_DAILY_LIMIT;
  __resetOcrQuota();
  __setOcrProviderForTests(okProvider);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  __setOcrProviderForTests(null);
});

describe("ocrService — flag and allowlist", () => {
  it("is disabled unless OCR_ENABLED=true", async () => {
    process.env.OCR_ENABLED = "false";
    expect(isOcrEnabledFor("a@test.com")).toBe(false);
    await expectCode(recognizeImageForUser(input()), 503, "OCR_DISABLED");
  });

  it("restricts to the beta allowlist (comma or semicolon, case-insensitive)", () => {
    process.env.OCR_BETA_EMAILS = "A@test.com; b@test.com,c@test.com";
    expect(isOcrEnabledFor("a@test.com")).toBe(true);
    expect(isOcrEnabledFor("c@test.com")).toBe(true);
    expect(isOcrEnabledFor("z@test.com")).toBe(false);
    expect(isOcrEnabledFor(undefined)).toBe(false);
  });

  it("reports config with remaining quota", () => {
    process.env.OCR_DAILY_LIMIT = "5";
    expect(getOcrConfigFor("u1", "a@test.com")).toEqual({ enabled: true, dailyLimit: 5, remaining: 5 });
    process.env.OCR_ENABLED = "false";
    expect(getOcrConfigFor("u1", "a@test.com").enabled).toBe(false);
  });
});

describe("ocrService — validation", () => {
  it("rejects non-image MIME types", async () => {
    await expectCode(recognizeImageForUser(input({ mimeType: "application/pdf" })), 422, "OCR_UNSUPPORTED_TYPE");
  });

  it("rejects empty and oversize buffers", async () => {
    await expectCode(recognizeImageForUser(input({ buffer: Buffer.alloc(0) })), 422, "OCR_UNSUPPORTED_TYPE");
    await expectCode(
      recognizeImageForUser(input({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })),
      422,
      "OCR_UNSUPPORTED_TYPE",
    );
  });

  it("normalizes language hints", () => {
    expect(normalizeLanguageHint(undefined)).toBeUndefined();
    expect(normalizeLanguageHint("")).toBeUndefined();
    expect(normalizeLanguageHint("auto")).toBeUndefined();
    expect(normalizeLanguageHint("fr")).toBe("fr");
    expect(normalizeLanguageHint("zh-Hant")).toBe("zh-Hant");
    expect(normalizeLanguageHint("pt-BR")).toBe("pt-BR");
    expect(() => normalizeLanguageHint("français")).toThrow(expect.objectContaining({ code: "OCR_INVALID_LANGUAGE" }));
    expect(() => normalizeLanguageHint(42)).toThrow(expect.objectContaining({ code: "OCR_INVALID_LANGUAGE" }));
  });

  it("accepts only known sources", () => {
    expect(normalizeOcrSource("gdrive")).toBe("gdrive");
    expect(normalizeOcrSource("evil")).toBeUndefined();
  });
});

describe("ocrService — recognition", () => {
  it("returns text and detected languages, forwarding the hint", async () => {
    const res = await recognizeImageForUser(input({ languageHint: "ar" }));
    expect(res.text).toBe("Bonjour\nmonde");
    expect(res.detectedLanguages[0].code).toBe("ar");
    expect(res.code).toBeUndefined();
  });

  it("flags empty results with OCR_NO_TEXT", async () => {
    __setOcrProviderForTests({ name: "empty", recognize: async () => ({ text: "", detectedLanguages: [] }) });
    const res = await recognizeImageForUser(input());
    expect(res).toEqual({ text: "", detectedLanguages: [], code: "OCR_NO_TEXT" });
  });

  it("maps provider failures to 502 and refunds the quota", async () => {
    process.env.OCR_DAILY_LIMIT = "1";
    __setOcrProviderForTests({
      name: "broken",
      recognize: async () => {
        throw new OcrProviderFailure("boom");
      },
    });
    await expectCode(recognizeImageForUser(input()), 502, "OCR_PROVIDER_ERROR");
    expect(getOcrConfigFor("u1", "a@test.com").remaining).toBe(1);
  });

  it("enforces the per-user daily quota", async () => {
    process.env.OCR_DAILY_LIMIT = "2";
    await recognizeImageForUser(input());
    await recognizeImageForUser(input());
    await expectCode(recognizeImageForUser(input()), 429, "OCR_QUOTA_EXCEEDED");
    await expect(recognizeImageForUser(input({ uid: "u2" }))).resolves.toBeTruthy();
  });

  it("mock provider works when selected by env", async () => {
    __setOcrProviderForTests(null);
    process.env.OCR_PROVIDER = "mock";
    const res = await recognizeImageForUser(input());
    expect(res.text).toContain("mock");
  });
});

describe("reconstructTextFromPages", () => {
  it("reorders words by geometric line (Y then X) instead of Vision block order", () => {
    // Simulates sparse handwriting where Vision emits line2 words before finishing line1.
    const pages = [
      {
        blocks: [
          {
            paragraphs: [
              {
                words: [
                  {
                    symbols: [{ text: "Nouvelle" }],
                    boundingBox: { vertices: [{ x: 10, y: 10 }, { x: 80, y: 10 }, { x: 80, y: 30 }, { x: 10, y: 30 }] },
                  },
                  {
                    symbols: [{ text: "Ceci" }],
                    boundingBox: { vertices: [{ x: 10, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 70 }, { x: 10, y: 70 }] },
                  },
                  {
                    symbols: [{ text: "prise" }],
                    boundingBox: { vertices: [{ x: 90, y: 10 }, { x: 140, y: 10 }, { x: 140, y: 30 }, { x: 90, y: 30 }] },
                  },
                  {
                    symbols: [{ text: "est" }],
                    boundingBox: { vertices: [{ x: 60, y: 50 }, { x: 90, y: 50 }, { x: 90, y: 70 }, { x: 60, y: 70 }] },
                  },
                  {
                    symbols: [{ text: "de" }],
                    boundingBox: { vertices: [{ x: 150, y: 10 }, { x: 175, y: 10 }, { x: 175, y: 30 }, { x: 150, y: 30 }] },
                  },
                  {
                    symbols: [{ text: "un" }],
                    boundingBox: { vertices: [{ x: 100, y: 50 }, { x: 130, y: 50 }, { x: 130, y: 70 }, { x: 100, y: 70 }] },
                  },
                  {
                    symbols: [{ text: "note" }],
                    boundingBox: { vertices: [{ x: 185, y: 10 }, { x: 230, y: 10 }, { x: 230, y: 30 }, { x: 185, y: 30 }] },
                  },
                  {
                    symbols: [{ text: "test" }],
                    boundingBox: { vertices: [{ x: 140, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 70 }, { x: 140, y: 70 }] },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
    expect(reconstructTextFromPages(pages)).toBe("Nouvelle prise de note\nCeci est un test");
  });
});

describe("parseVisionResponse", () => {
  it("extracts text and dedupes languages by best confidence", () => {
    const parsed = parseVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "  مرحبا\nhello \n",
            pages: [
              { property: { detectedLanguages: [{ languageCode: "ar", confidence: 0.6 }, { languageCode: "en", confidence: 0.3 }] } },
              { property: { detectedLanguages: [{ languageCode: "ar", confidence: 0.8 }] } },
            ],
          },
        },
      ],
    });
    // No word boxes → falls back to fullTextAnnotation.text
    expect(parsed.text).toBe("مرحبا\nhello");
    expect(parsed.detectedLanguages).toEqual([
      { code: "ar", confidence: 0.8 },
      { code: "en", confidence: 0.3 },
    ]);
  });

  it("prefers geometry rebuild when word boxes are present", () => {
    const parsed = parseVisionResponse({
      responses: [
        {
          fullTextAnnotation: {
            text: "wrong\norder",
            pages: [
              {
                property: { detectedLanguages: [{ languageCode: "fr", confidence: 0.9 }] },
                blocks: [
                  {
                    paragraphs: [
                      {
                        words: [
                          {
                            symbols: [{ text: "Bonne" }],
                            boundingBox: { vertices: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }] },
                          },
                          {
                            symbols: [{ text: "journée" }],
                            boundingBox: { vertices: [{ x: 50, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 20 }, { x: 50, y: 20 }] },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(parsed.text).toBe("Bonne journée");
  });

  it("returns empty text when nothing was found", () => {
    expect(parseVisionResponse({ responses: [{}] })).toEqual({ text: "", detectedLanguages: [] });
    expect(parseVisionResponse({})).toEqual({ text: "", detectedLanguages: [] });
  });

  it("throws on per-image errors", () => {
    expect(() => parseVisionResponse({ responses: [{ error: { code: 3, message: "Bad image data" } }] })).toThrow(
      OcrProviderFailure,
    );
  });
});
