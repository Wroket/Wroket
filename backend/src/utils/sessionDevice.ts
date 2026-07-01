const MAX_UA_LEN = 300;

/**
 * Builds a short human-readable device label from a User-Agent string.
 * No external dependency — regex heuristics only.
 */
export function deviceLabelFromUserAgent(userAgent: string | undefined): string {
  if (!userAgent?.trim()) return "Appareil inconnu";
  const ua = userAgent.trim();

  let browser = "Navigateur";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "Inconnu";
  if (/iPhone|iPad|iPod/i.test(ua)) os = /iPad/i.test(ua) ? "iPad" : "iPhone";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return `${browser} · ${os}`;
}

export function truncateUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined;
  const t = userAgent.trim();
  if (!t) return undefined;
  return t.length > MAX_UA_LEN ? t.slice(0, MAX_UA_LEN) : t;
}
