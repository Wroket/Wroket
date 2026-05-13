import type { Project, Todo } from "@/lib/api";

/** Min/max calendar dates (YYYY-MM-DD) from the task phase, for SlotPicker / agenda clamp. */
export function getPhaseSlotDateBounds(
  todo: Pick<Todo, "phaseId"> | null | undefined,
  projects: Project[],
): { min?: string; max?: string } {
  if (!todo?.phaseId) return {};
  for (const proj of projects) {
    const ph = proj.phases?.find((p) => p.id === todo.phaseId);
    if (ph) {
      return {
        ...(ph.startDate ? { min: ph.startDate } : {}),
        ...(ph.endDate ? { max: ph.endDate } : {}),
      };
    }
  }
  return {};
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar YYYY-MM-DD for an instant (browser timezone). */
export function localYmdFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** First and last local calendar days occupied by [startMs, endMs) (end exclusive for “last tick”). */
export function localFirstLastDayYmd(startMs: number, endMs: number): { first: string; last: string } {
  const first = localYmdFromMs(startMs);
  const lastTick = endMs > startMs ? endMs - 1 : startMs;
  const last = localYmdFromMs(lastTick);
  return { first, last };
}

/** Client-side mirror of phase window (local days) before calling bookSlot; server enforces UTC phase bounds. */
export function isSlotWithinPhaseLocalDays(
  bounds: { min?: string; max?: string },
  startMs: number,
  endMs: number,
): boolean {
  const { first, last } = localFirstLastDayYmd(startMs, endMs);
  if (bounds.min && first < bounds.min) return false;
  if (bounds.max && last > bounds.max) return false;
  return true;
}
