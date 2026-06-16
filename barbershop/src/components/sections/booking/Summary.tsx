"use client";

import { Scissors, User, CalendarDays, Clock } from "lucide-react";
import { getService } from "@/data/services";
import { getBarber } from "@/data/team";
import { formatHebrewDate, formatPrice } from "@/lib/utils";
import type { BookingDraft } from "@/lib/types";

export function Summary({ draft }: { draft: BookingDraft }) {
  const service = getService(draft.serviceId);
  const barber = getBarber(draft.barberId);
  const dateLabel = draft.date
    ? formatHebrewDate(new Date(`${draft.date}T00:00:00`))
    : null;

  const rows = [
    { icon: Scissors, label: "שירות", value: service?.name },
    { icon: User, label: "ספר", value: barber?.name },
    { icon: CalendarDays, label: "תאריך", value: dateLabel },
    { icon: Clock, label: "שעה", value: draft.time },
  ];

  return (
    <aside className="glass-strong flex flex-col gap-5 rounded-2xl p-6">
      <h3 className="font-display text-lg font-semibold">סיכום ההזמנה</h3>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-sm">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <row.icon className="size-4" />
            </span>
            <span className="text-muted-foreground">{row.label}</span>
            <span className="mr-auto text-left font-medium text-foreground">
              {row.value ?? "—"}
            </span>
          </li>
        ))}
      </ul>

      {service ? (
        <>
          <div className="divider-gold" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">סה״כ לתשלום</span>
            <span className="font-display text-2xl font-bold text-gold-gradient">
              {formatPrice(service.price)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            התשלום מתבצע במספרה בסיום השירות.
          </p>
        </>
      ) : null}
    </aside>
  );
}
