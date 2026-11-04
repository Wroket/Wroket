import {
  listBookableCalendars,
  resolveBookingTarget,
  type BookingTargetRequest,
  type ResolvedBookingTarget,
} from "../authService";
import { optionalString } from "./types";

/**
 * Resolve a booking calendar from MCP args:
 * - explicit provider/accountId/calendarId
 * - or match by tag / customLabel / label among bookable calendars
 */
export function resolveBookingTargetFromArgs(
  uid: string,
  args: Record<string, unknown>,
  fallback?: BookingTargetRequest | null,
): ResolvedBookingTarget | null {
  const providerRaw = optionalString(args, "provider");
  const provider =
    providerRaw === "google" || providerRaw === "microsoft" ? providerRaw : undefined;
  const accountId = optionalString(args, "accountId") ?? undefined;
  const calendarId = optionalString(args, "calendarId") ?? undefined;
  const tag = optionalString(args, "calendarTag") ?? optionalString(args, "tag");
  const labelHint =
    optionalString(args, "calendarLabel") ??
    optionalString(args, "customLabel") ??
    optionalString(args, "calendarName");

  if (calendarId) {
    return resolveBookingTarget(uid, { provider, accountId, calendarId });
  }

  if (tag || labelHint) {
    const bookable = listBookableCalendars(uid);
    const needleTag = tag?.trim().toLowerCase();
    const needleLabel = labelHint?.trim().toLowerCase();
    const match = bookable.find((c) => {
      if (provider && c.provider !== provider) return false;
      if (accountId && c.accountId !== accountId) return false;
      if (needleTag && (c.tag ?? "").toLowerCase() === needleTag) return true;
      if (needleLabel) {
        const names = [c.customLabel, c.displayName, c.label]
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .map((v) => v.toLowerCase());
        if (names.some((n) => n === needleLabel || n.includes(needleLabel))) return true;
      }
      return false;
    });
    if (match) {
      return {
        provider: match.provider,
        accountId: match.accountId,
        calendarId: match.calendarId,
      };
    }
  }

  return resolveBookingTarget(uid, fallback ?? null);
}

export const bookingTargetSchemaProperties = {
  provider: { type: "string", enum: ["google", "microsoft"], description: "Calendar provider" },
  accountId: { type: "string", description: "Connected account id" },
  calendarId: { type: "string", description: "External calendar id" },
  calendarTag: {
    type: "string",
    description: "Match a bookable calendar by its short tag (e.g. Pro, Perso)",
  },
  calendarLabel: {
    type: "string",
    description: "Match a bookable calendar by customLabel / display name",
  },
} as const;
