import { NextResponse } from "next/server";
import { availableTimes } from "@/lib/booking-store";
import { generateSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const barberId = searchParams.get("barberId") ?? "any";

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, error: "תאריך לא תקין" },
      { status: 400 },
    );
  }

  const total = generateSlots(date).length;
  const times = availableTimes(barberId, date);

  return NextResponse.json({
    ok: true,
    date,
    barberId,
    closed: total === 0,
    times,
  });
}
