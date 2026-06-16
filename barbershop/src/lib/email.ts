import { site } from "@/lib/site";
import { getService } from "@/data/services";
import { getBarber } from "@/data/team";
import { formatHebrewDate, formatPrice } from "@/lib/utils";
import type { Booking } from "@/lib/types";

/**
 * Send a booking confirmation email.
 *
 * Uses SMTP via nodemailer when the SMTP_* env vars are configured.
 * If they are not set, the email is logged to the console and the function
 * resolves gracefully (so local development / demos never crash).
 */
export async function sendConfirmationEmail(
  booking: Booking,
): Promise<boolean> {
  const service = getService(booking.serviceId);
  const barber = getBarber(booking.barberId);
  const dateLabel = formatHebrewDate(new Date(`${booking.date}T00:00:00`));

  const subject = `אישור הזמנה • ${site.name} ברברשופ`;
  const html = renderEmail(booking, {
    serviceName: service?.name ?? "שירות",
    price: service ? formatPrice(service.price) : "",
    barberName: barber?.name ?? "הצוות",
    dateLabel,
  });

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.info(
      `[email] SMTP not configured — confirmation for ${booking.email} not sent.\n` +
        `        Booking ${booking.id}: ${service?.name} • ${dateLabel} ${booking.time}`,
    );
    return false;
  }

  try {
    // Imported lazily so the app builds/runs even if nodemailer is absent.
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT ?? 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_FROM ?? `${site.name} <${SMTP_USER}>`,
      to: booking.email,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("[email] Failed to send confirmation:", err);
    return false;
  }
}

function renderEmail(
  booking: Booking,
  data: { serviceName: string; price: string; barberName: string; dateLabel: string },
): string {
  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#0c0c0e;padding:32px;color:#f5f1e6">
    <div style="max-width:560px;margin:0 auto;background:#141416;border:1px solid #26262b;border-radius:18px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#1a1a1d,#0c0c0e);padding:28px 32px;border-bottom:1px solid #26262b">
        <h1 style="margin:0;font-size:22px;letter-spacing:1px;color:#e4be63">${site.name} • ${site.tagline}</h1>
        <p style="margin:6px 0 0;color:#a7a29a;font-size:14px">ההזמנה שלך אושרה ✦</p>
      </div>
      <div style="padding:28px 32px">
        <p style="font-size:16px;margin:0 0 18px">שלום ${booking.name},</p>
        <p style="font-size:14px;color:#c9c4ba;margin:0 0 22px;line-height:1.7">
          תודה שבחרת ב${site.name}. שמרנו לך את התור — נתראה בקרוב!
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          ${row("שירות", data.serviceName)}
          ${row("ספר", data.barberName)}
          ${row("תאריך", data.dateLabel)}
          ${row("שעה", booking.time)}
          ${data.price ? row("מחיר", data.price) : ""}
          ${booking.notes ? row("הערות", booking.notes) : ""}
        </table>
        <div style="margin-top:26px;padding:16px;border:1px dashed #3a3a40;border-radius:12px;color:#a7a29a;font-size:13px;line-height:1.7">
          📍 ${site.address}<br/>
          ☎️ ${site.phone}<br/>
          לביטול או שינוי, צרו קשר עד שעתיים לפני התור.
        </div>
      </div>
      <div style="padding:18px 32px;background:#0c0c0e;color:#6c6760;font-size:12px;text-align:center">
        מספר הזמנה: ${booking.id}
      </div>
    </div>
  </div>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;color:#8a857c;border-bottom:1px solid #26262b;width:90px">${label}</td>
    <td style="padding:10px 0;color:#f5f1e6;border-bottom:1px solid #26262b;font-weight:bold">${value}</td>
  </tr>`;
}
