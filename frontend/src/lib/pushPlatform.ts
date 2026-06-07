export type PushPlatformHint = "windows" | "macChrome" | "macSafari" | "mobile" | "generic";

export function detectPushPlatformHint(userAgent?: string): PushPlatformHint {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "") ?? "";
  if (!ua) return "generic";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  if (isMobile) return "mobile";

  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
  if (isMac && isSafari) return "macSafari";

  if (/Windows/i.test(ua)) return "windows";
  if (isMac) return "macChrome";

  return "generic";
}
