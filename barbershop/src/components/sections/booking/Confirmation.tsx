"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Mail, MapPin, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getService } from "@/data/services";
import { getBarber } from "@/data/team";
import { site } from "@/lib/site";
import { formatHebrewDate, formatPrice } from "@/lib/utils";
import type { Booking } from "@/lib/types";

export function Confirmation({
  booking,
  emailSent,
  onReset,
}: {
  booking: Booking;
  emailSent: boolean;
  onReset: () => void;
}) {
  const service = getService(booking.serviceId);
  const barber = getBarber(booking.barberId);
  const dateLabel = formatHebrewDate(new Date(`${booking.date}T00:00:00`));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center gap-6 py-6 text-center"
    >
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 14 }}
        className="grid size-20 place-items-center rounded-full bg-primary/15 text-primary shadow-glow"
      >
        <CheckCircle2 className="size-12" />
      </motion.span>

      <div>
        <h3 className="font-display text-2xl font-bold sm:text-3xl">
          התור שלך אושר! ✦
        </h3>
        <p className="mt-2 text-muted-foreground">
          תודה {booking.name.split(" ")[0]}, נתראה בקרוב ב{site.name}.
        </p>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 text-right">
        <Row label="שירות" value={service?.name} />
        <Row label="ספר" value={barber?.name} />
        <Row label="תאריך" value={dateLabel} />
        <Row label="שעה" value={booking.time} />
        {service ? <Row label="מחיר" value={formatPrice(service.price)} /> : null}
        <div className="my-3 divider-gold" />
        <p className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {emailSent ? (
            <>
              אישור נשלח לכתובת {booking.email}
              <Mail className="size-3.5 text-primary" />
            </>
          ) : (
            <>פרטי ההזמנה נשמרו. נשמח לראותך! <Mail className="size-3.5 text-primary" /></>
          )}
        </p>
        <p className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          {site.address}
          <MapPin className="size-3.5 text-primary" />
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={onReset}>
          <CalendarPlus className="size-4" />
          קביעת תור נוסף
        </Button>
        <Button
          onClick={() =>
            document.querySelector("#hero")?.scrollIntoView({ behavior: "smooth" })
          }
        >
          חזרה לראש העמוד
        </Button>
      </div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
