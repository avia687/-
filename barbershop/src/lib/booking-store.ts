import type { Booking } from "@/lib/types";
import { bookableBarbers } from "@/data/team";
import { generateSlots, isPastSlot } from "@/lib/slots";

/**
 * In-memory booking store.
 *
 * NOTE: This is intentionally simple for the demo. In a serverless
 * deployment the data resets on cold start. For production, replace the
 * Map operations below with a real database (Postgres / Prisma, Supabase,
 * etc.) — the public function signatures can stay identical.
 */

type SlotKey = `${string}|${string}|${string}`; // barberId|date|time

const globalForStore = globalThis as unknown as {
  __barberBookings?: Map<SlotKey, Booking>;
};

const bookings: Map<SlotKey, Booking> =
  globalForStore.__barberBookings ?? new Map();

if (process.env.NODE_ENV !== "production") {
  globalForStore.__barberBookings = bookings;
}

function key(barberId: string, date: string, time: string): SlotKey {
  return `${barberId}|${date}|${time}`;
}

/** Is a specific barber free at this slot? */
export function isBarberFree(
  barberId: string,
  date: string,
  time: string,
): boolean {
  return !bookings.has(key(barberId, date, time));
}

/**
 * Available times for a date. If barberId is "any" (or falsy), a slot is
 * available when at least one bookable barber is free.
 */
export function availableTimes(barberId: string, date: string): string[] {
  const all = generateSlots(date);
  return all.filter((time) => {
    if (isPastSlot(date, time)) return false;
    if (!barberId || barberId === "any") {
      return bookableBarbers.some((b) => isBarberFree(b.id, date, time));
    }
    return isBarberFree(barberId, date, time);
  });
}

/** First free barber for an "any" booking, or null if none. */
export function firstFreeBarber(date: string, time: string): string | null {
  const free = bookableBarbers.find((b) => isBarberFree(b.id, date, time));
  return free?.id ?? null;
}

export type CreateResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "taken" | "past" | "closed" };

/** Attempt to create a booking, preventing double-booking. */
export function createBooking(input: {
  id: string;
  serviceId: string;
  barberId: string; // may be "any"
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}): CreateResult {
  if (isPastSlot(input.date, input.time)) return { ok: false, reason: "past" };
  if (generateSlots(input.date).length === 0)
    return { ok: false, reason: "closed" };

  let barberId = input.barberId;
  if (!barberId || barberId === "any") {
    const assigned = firstFreeBarber(input.date, input.time);
    if (!assigned) return { ok: false, reason: "taken" };
    barberId = assigned;
  } else if (!isBarberFree(barberId, input.date, input.time)) {
    return { ok: false, reason: "taken" };
  }

  const booking: Booking = {
    id: input.id,
    serviceId: input.serviceId,
    barberId,
    date: input.date,
    time: input.time,
    name: input.name,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    createdAt: new Date().toISOString(),
  };

  bookings.set(key(barberId, input.date, input.time), booking);
  return { ok: true, booking };
}
