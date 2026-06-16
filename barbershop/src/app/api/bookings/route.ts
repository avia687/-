import { NextResponse } from "next/server";
import { bookingSchema } from "@/lib/validation";
import { createBooking } from "@/lib/booking-store";
import { sendConfirmationEmail } from "@/lib/email";
import { makeId } from "@/lib/utils";
import type { BookingResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json<BookingResponse>(
      { ok: false, error: "בקשה לא תקינה" },
      { status: 400 },
    );
  }

  const parsed = bookingSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
    return NextResponse.json<BookingResponse>(
      { ok: false, error: first },
      { status: 422 },
    );
  }

  const data = parsed.data;
  const result = createBooking({
    id: makeId("bk"),
    serviceId: data.serviceId,
    barberId: data.barberId,
    date: data.date,
    time: data.time,
    name: data.name,
    phone: data.phone,
    email: data.email,
    notes: data.notes ?? "",
  });

  if (!result.ok) {
    const messages: Record<string, string> = {
      taken: "השעה הזו נתפסה הרגע. אנא בחר/י שעה אחרת.",
      past: "לא ניתן לקבוע תור בשעה שכבר עברה.",
      closed: "המספרה סגורה בתאריך זה.",
    };
    return NextResponse.json<BookingResponse>(
      { ok: false, error: messages[result.reason] },
      { status: 409 },
    );
  }

  const emailSent = await sendConfirmationEmail(result.booking).catch(() => false);

  return NextResponse.json<BookingResponse>(
    { ok: true, booking: result.booking, emailSent },
    { status: 201 },
  );
}
