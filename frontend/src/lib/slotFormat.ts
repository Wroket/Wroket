import type { ScheduledSlot } from "@/lib/api";

/** Local weekday + day + time, e.g. "Fri, 17, 9:00 AM" — no emoji (callers add prefix if needed). */
export function formatScheduledSlotLabel(slot: ScheduledSlot): string {
  const d = new Date(slot.start);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}
