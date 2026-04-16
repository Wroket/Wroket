import {
  API_BASE_URL,
  parseJsonOrThrow,
  extractApiMessage,
  getBrowserTimezone,
  type AuthMeResponse,
  type WorkingHours,
  type ActivityLogEntry,
  type NotificationDeliveryMode,
  type NotificationOutboundFrequency,
  type NotificationType,
} from "./core";

interface LoginPayload {
  email: string;
  password: string;
}

export type TwoFactorMethod = "totp" | "email";

export type LoginOutcome =
  | { status: "ok" }
  | { status: "needs_two_factor"; pendingToken: string; twoFactorMethods: TwoFactorMethod[] };

export async function login(payload: LoginPayload): Promise<LoginOutcome> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, timezone: getBrowserTimezone() }),
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(extractApiMessage(body, "Identifiants invalides"));
  }
  if (body.requiresTwoFactor === true && typeof body.pendingToken === "string") {
    const raw = body.twoFactorMethods;
    let twoFactorMethods: TwoFactorMethod[] = ["totp"];
    if (Array.isArray(raw)) {
      twoFactorMethods = raw.filter((m): m is TwoFactorMethod => m === "totp" || m === "email");
    }
    if (twoFactorMethods.length === 0) twoFactorMethods = ["totp"];
    return { status: "needs_two_factor", pendingToken: body.pendingToken, twoFactorMethods };
  }
  return { status: "ok" };
}

export async function fetchPendingTwoFactorMeta(pendingToken: string): Promise<TwoFactorMethod[]> {
  const res = await fetch(
    `${API_BASE_URL}/auth/2fa/pending-meta?${new URLSearchParams({ pendingToken })}`,
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(extractApiMessage(body, "Session 2FA invalide"));
  }
  const raw = body.twoFactorMethods;
  let twoFactorMethods: TwoFactorMethod[] = ["totp"];
  if (Array.isArray(raw)) {
    twoFactorMethods = raw.filter((m): m is TwoFactorMethod => m === "totp" || m === "email");
  }
  if (twoFactorMethods.length === 0) twoFactorMethods = ["totp"];
  return twoFactorMethods;
}

export async function sendEmailOtpForPendingLogin(pendingToken: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Envoi impossible"));
  }
}

export async function verifyTwoFactor(pendingToken: string, code: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken, code: code.replace(/\s/g, "") }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Code invalide"));
  }
}

export async function totpSetup(): Promise<{ otpauthUrl: string; secret: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/setup`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
  return (await res.json()) as { otpauthUrl: string; secret: string };
}

export async function totpEnable(code: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim() }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Code incorrect"));
  }
}

export async function totpDisable(opts: { password?: string; code: string }): Promise<void> {
  const body: { code: string; password?: string } = { code: opts.code.trim() };
  if (opts.password !== undefined && opts.password !== "") {
    body.password = opts.password;
  }
  const res = await fetch(`${API_BASE_URL}/auth/2fa/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
}

export async function totpCancelSetup(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/cancel-setup`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur");
}

export async function requestEmail2faEnrollment(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/email/request-enrollment`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
}

export async function confirmEmail2faEnrollment(code: string): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/email/confirm-enrollment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.trim() }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Code incorrect"));
  }
  return (await res.json()) as AuthMeResponse;
}

export async function putTotpEmailFallback(enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/email/totp-fallback`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
}

export async function requestEmail2faDisableOtp(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/email/disable-request`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
}

export async function disableEmailOtp2fa(opts: { password?: string; code: string }): Promise<void> {
  const body: { code: string; password?: string } = { code: opts.code.trim() };
  if (opts.password !== undefined && opts.password !== "") {
    body.password = opts.password;
  }
  const res = await fetch(`${API_BASE_URL}/auth/2fa/email/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const bodyJson = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(bodyJson, "Erreur"));
  }
}

export async function register(
  payload: LoginPayload,
): Promise<{ needsVerification?: boolean }> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, timezone: getBrowserTimezone() }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de s'enregistrer"));
  }
  const body = await res.json();
  return body as { needsVerification?: boolean };
}

export async function verifyEmailApi(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur de vérification"));
  }
}

export async function resendVerificationApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors du renvoi"));
  }
}

export async function forgotPasswordApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur"));
  }
}

export async function resetPasswordApi(token: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de la réinitialisation"));
  }
}

export async function getGoogleSsoUrl(loginHint?: string): Promise<string> {
  const params = loginHint ? `?login_hint=${encodeURIComponent(loginHint)}` : "";
  const res = await fetch(`${API_BASE_URL}/auth/google/url${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur d'authentification Google");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function shareInviteApi(email: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/share-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur lors de l'envoi"));
  }
}

export async function getMe(): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Non authentifié");
  return (await res.json()) as AuthMeResponse;
}

export type { NotificationOutboundFrequency, NotificationType };

export async function updateProfile(payload: {
  firstName?: string;
  lastName?: string;
  effortMinutes?: { light: number; medium: number; heavy: number };
  workingHours?: WorkingHours;
  skipNonWorkingDays?: boolean;
  notificationDeliveryMode?: NotificationDeliveryMode;
  notificationDeliveryWebhookUrl?: string | null;
  notificationTypesDisabledInApp?: NotificationType[];
  notificationTypesDisabledOutbound?: NotificationType[];
  notificationOutboundFrequency?: NotificationOutboundFrequency;
  notificationDigestHour?: number;
  archivedTaskRetentionDays?: number;
}): Promise<AuthMeResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Impossible de mettre à jour le profil"));
  }
  return (await res.json()) as AuthMeResponse;
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erreur lors de la déconnexion");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Erreur lors du changement de mot de passe");
  }
}

export async function getMyExport(): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE_URL}/auth/my-export`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger l'export");
  return res.json();
}

export async function deleteMyAccount(confirmation: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/my-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Erreur lors de la suppression");
  }
}

export async function getMyActivity(params?: {
  limit?: number;
  offset?: number;
  /** Rolling window: only entries from the last N days (server-side filter). */
  days?: number;
}): Promise<{ entries: ActivityLogEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.days != null) qs.set("days", String(params.days));
  const res = await fetch(`${API_BASE_URL}/auth/my-activity?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new Error("Impossible de charger l'historique");
  return res.json();
}

export interface SearchResult {
  type: "todo" | "project" | "note";
  id: string;
  title: string;
  snippet?: string;
  status?: string;
}

export async function globalSearch(
  query: string,
  opts?: { signal?: AbortSignal },
): Promise<SearchResult[]> {
  if (query.length < 2) return [];
  const res = await fetch(`${API_BASE_URL}/auth/search?q=${encodeURIComponent(query)}`, {
    credentials: "include",
    signal: opts?.signal,
  });
  if (!res.ok) {
    const body = await parseJsonOrThrow(res);
    throw new Error(extractApiMessage(body, "Erreur de recherche"));
  }
  return (await res.json()) as SearchResult[];
}

export async function lookupUser(email: string): Promise<AuthMeResponse | null> {
  const res = await fetch(`${API_BASE_URL}/auth/lookup?email=${encodeURIComponent(email)}`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Erreur lors de la recherche utilisateur");
  return (await res.json()) as AuthMeResponse;
}

export async function lookupUserByUid(uid: string): Promise<AuthMeResponse | null> {
  const res = await fetch(`${API_BASE_URL}/auth/lookup-uid?uid=${encodeURIComponent(uid)}`, {
    method: "GET",
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Erreur lors de la recherche utilisateur");
  return (await res.json()) as AuthMeResponse;
}
