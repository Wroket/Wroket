import { listTodos } from "./todoService";
import { WorkingHours } from "./authService";

export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface SlotProposal {
  start: string; // ISO
  end: string;   // ISO
  label: string; // e.g. "Lun 24 mars, 09:00 – 09:30"
}

/**
 * Finds available time slots for a task, respecting working hours,
 * already scheduled tasks, and external busy slots.
 */
export function findAvailableSlots(
  userId: string,
  durationMinutes: number,
  workingHours: WorkingHours,
  busySlots: TimeSlot[],
  maxResults: number = 3,
  startFrom?: Date,
): SlotProposal[] {
  const now = startFrom ?? new Date();
  const allTodos = listTodos(userId);

  const occupiedSlots: TimeSlot[] = [
    ...busySlots,
    ...allTodos
      .filter((t) => t.scheduledSlot)
      .map((t) => ({
        start: new Date(t.scheduledSlot!.start),
        end: new Date(t.scheduledSlot!.end),
      })),
  ];

  const proposals: SlotProposal[] = [];
  const searchDays = 30;

  for (let dayOffset = 0; dayOffset < searchDays && proposals.length < maxResults; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);

    const dayOfWeek = day.getDay();
    if (!workingHours.daysOfWeek.includes(dayOfWeek)) continue;

    const [startH, startM] = workingHours.start.split(":").map(Number);
    const [endH, endM] = workingHours.end.split(":").map(Number);

    const dayStart = new Date(day);
    dayStart.setHours(startH, startM, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(endH, endM, 0, 0);

    let slotStart = new Date(dayStart);
    if (dayOffset === 0 && now > dayStart) {
      slotStart = new Date(now);
      const mins = slotStart.getMinutes();
      const roundedMins = Math.ceil(mins / 15) * 15;
      slotStart.setMinutes(roundedMins, 0, 0);
    }

    while (slotStart < dayEnd && proposals.length < maxResults) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

      if (slotEnd > dayEnd) break;

      const overlaps = occupiedSlots.some(
        (occ) => slotStart < occ.end && slotEnd > occ.start,
      );

      if (!overlaps) {
        proposals.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          label: formatSlotLabel(slotStart, slotEnd),
        });
        slotStart = new Date(slotEnd.getTime() + 60 * 60_000);
      } else {
        slotStart = new Date(slotStart.getTime() + 15 * 60_000);
      }
    }
  }

  return proposals;
}

function formatSlotLabel(start: Date, end: Date): string {
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const dayName = dayNames[start.getDay()];
  const day = start.getDate();
  const month = start.toLocaleString("fr-FR", { month: "long" });
  const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  return `${dayName} ${day} ${month}, ${startTime} – ${endTime}`;
}
