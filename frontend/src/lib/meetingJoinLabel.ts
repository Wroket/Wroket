/** i18n key for the primary action link to open Meet or Teams from a task or agenda cell. */
export function meetingJoinI18nKey(
  meetingProvider: "google-meet" | "microsoft-teams" | null | undefined,
): "meet.joinGoogleMeet" | "meet.joinTeams" | "meet.joinMeet" {
  if (meetingProvider === "microsoft-teams") return "meet.joinTeams";
  if (meetingProvider === "google-meet") return "meet.joinGoogleMeet";
  return "meet.joinMeet";
}
