import { site } from "@/lib/site";
import { toDateKey } from "@/lib/utils";

/**
 * Generate the grid of slot times (HH:mm) for a given date based on the
 * shop's working hours. Does not account for bookings — that is layered
 * on top by the availability route / store.
 */
export function generateSlots(dateKey: string): string[] {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.getDay();
  const window = site.workingHours[weekday];
  if (!window) return [];

  const [open, close] = window;
  const step = site.slotStepMin;
  const slots: string[] = [];

  for (let minutes = open * 60; minutes + step <= close * 60; minutes += step) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return slots;
}

/** Is the given date a working day? */
export function isWorkingDay(date: Date): boolean {
  return site.workingHours[date.getDay()] !== null;
}

/**
 * Whether a slot on a given date/time is already in the past relative to now.
 */
export function isPastSlot(dateKey: string, time: string): boolean {
  const now = new Date();
  const slot = new Date(`${dateKey}T${time}:00`);
  // Add a small buffer so the very next minutes aren't bookable.
  return slot.getTime() < now.getTime() + 15 * 60 * 1000;
}

/** The next N selectable calendar days (only working days included). */
export function upcomingDays(count = 14): { key: string; date: Date }[] {
  const days: { key: string; date: Date }[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (days.length < count && guard < 60) {
    if (isWorkingDay(cursor)) {
      days.push({ key: toDateKey(cursor), date: new Date(cursor) });
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return days;
}
