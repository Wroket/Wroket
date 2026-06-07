import type { Locale, TranslationKey } from "@/lib/i18n";
import { getLocale, tForLocale } from "@/lib/i18n";

export interface ApiErrorBody {
  message?: string;
  code?: string;
  requestId?: string;
  error?: string;
}

export class ApiClientError extends Error {
  readonly code?: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Maps backend `code` (or legacy message token) → i18n key. */
const ERROR_CODE_KEYS: Record<string, TranslationKey> = {
  AUTH_EMAIL_NOT_VERIFIED: "errors.code.AUTH_EMAIL_NOT_VERIFIED",
  EMAIL_NOT_VERIFIED: "errors.code.AUTH_EMAIL_NOT_VERIFIED",
  AUTH_INVALID_CREDENTIALS: "errors.code.AUTH_INVALID_CREDENTIALS",
  AUTH_TWO_FACTOR_EXPIRED: "errors.code.AUTH_TWO_FACTOR_EXPIRED",
  AUTH_TWO_FACTOR_INVALID: "errors.code.AUTH_TWO_FACTOR_INVALID",
  UNAUTHORIZED: "errors.code.UNAUTHORIZED",
  FORBIDDEN: "errors.code.FORBIDDEN",
  CALENDAR_SLOT_MISSING_RANGE: "errors.code.CALENDAR_SLOT_INVALID",
  CALENDAR_SLOT_RANGE_TYPE: "errors.code.CALENDAR_SLOT_INVALID",
  CALENDAR_SLOT_INVALID_DATE: "errors.code.CALENDAR_SLOT_INVALID",
  CALENDAR_SLOT_INVALID_RANGE: "errors.code.CALENDAR_SLOT_INVALID",
  CALENDAR_SLOT_TOO_LONG: "errors.code.CALENDAR_SLOT_TOO_LONG",
  CALENDAR_DEFAULT_BOOKING_REQUIRED: "errors.code.CALENDAR_DEFAULT_BOOKING_REQUIRED",
  CALENDAR_INTEGRATIONS_PLAN_REQUIRED: "errors.code.INTEGRATIONS_PLAN_REQUIRED",
  CALENDAR_SLOT_CONFLICT: "errors.code.CALENDAR_SLOT_CONFLICT",
  MEET_INVALID_INVITEE_EMAIL: "errors.code.MEET_INVALID_INVITEE_EMAIL",
  MEET_NOT_FOUND: "errors.code.MEET_NOT_FOUND",
  MEET_ACCOUNT_NOT_FOUND: "errors.code.MEET_ACCOUNT_NOT_FOUND",
  MEET_UPDATE_FAILED: "errors.code.MEET_UPDATE_FAILED",
  MEET_INVALID_RANGE: "errors.code.MEET_INVALID_RANGE",
  FREE_QUOTA_TASKS: "errors.code.FREE_QUOTA_TASKS",
  FREE_QUOTA_PROJECTS: "errors.code.FREE_QUOTA_PROJECTS",
  FREE_QUOTA_NOTES: "errors.code.FREE_QUOTA_NOTES",
  FREE_QUOTA_RECURRENCE: "errors.code.FREE_QUOTA_RECURRENCE",
  FREE_QUOTA_ATTACHMENTS: "errors.code.FREE_QUOTA_ATTACHMENTS",
  IMPORT_CSV_INVALID: "errors.code.IMPORT_CSV_INVALID",
  COLLAB_ACCEPT_FAILED: "errors.code.COLLAB_ACCEPT_FAILED",
  COLLAB_DECLINE_FAILED: "errors.code.COLLAB_DECLINE_FAILED",
};

function extractRawMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const o = body as Record<string, unknown>;
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  return undefined;
}

function extractCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const code = (body as ApiErrorBody).code;
  return typeof code === "string" && code.trim() ? code.trim() : undefined;
}

export function resolveApiError(
  body: unknown,
  fallbackKey: TranslationKey,
  locale: Locale = getLocale(),
): string {
  const code = extractCode(body);
  const raw = extractRawMessage(body);

  if (code && ERROR_CODE_KEYS[code]) {
    return tForLocale(locale, ERROR_CODE_KEYS[code]);
  }
  if (raw && ERROR_CODE_KEYS[raw]) {
    return tForLocale(locale, ERROR_CODE_KEYS[raw]);
  }
  if (raw) return raw;
  return tForLocale(locale, fallbackKey);
}

export function parseApiErrorFromBody(
  body: unknown,
  status: number,
  fallbackKey: TranslationKey,
  locale: Locale = getLocale(),
): ApiClientError {
  const code = extractCode(body);
  const requestId =
    typeof body === "object" && body !== null && typeof (body as ApiErrorBody).requestId === "string"
      ? (body as ApiErrorBody).requestId
      : undefined;
  const message = resolveApiError(body, fallbackKey, locale);
  return new ApiClientError(message, status, code, requestId);
}

export async function parseApiErrorResponse(
  res: Response,
  fallbackKey: TranslationKey,
  locale: Locale = getLocale(),
): Promise<ApiClientError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return parseApiErrorFromBody(body, res.status, fallbackKey, locale);
}

export async function throwApiError(
  res: Response,
  fallbackKey: TranslationKey,
  locale: Locale = getLocale(),
): Promise<never> {
  throw await parseApiErrorResponse(res, fallbackKey, locale);
}

/** Normalize caught errors for toasts (ApiClientError, Error, unknown). */
export function formatUserFacingError(
  err: unknown,
  fallbackKey: TranslationKey,
  locale: Locale = getLocale(),
): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) {
    if (ERROR_CODE_KEYS[err.message]) {
      return tForLocale(locale, ERROR_CODE_KEYS[err.message]);
    }
    if (err.message.trim()) return err.message;
  }
  return tForLocale(locale, fallbackKey);
}
