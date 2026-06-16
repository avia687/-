"use client";

import * as React from "react";
import { Check, Clock, Loader2, CalendarX, AlertCircle } from "lucide-react";
import { SmartImage } from "@/components/shared/SmartImage";
import { Input, Label, Textarea } from "@/components/ui/input";
import { StarRating } from "@/components/shared/StarRating";
import { services } from "@/data/services";
import { team } from "@/data/team";
import { upcomingDays } from "@/lib/slots";
import { cn, formatPrice } from "@/lib/utils";
import type { BookingDraft } from "@/lib/types";

/* ----------------------------- Service step ----------------------------- */
export function ServiceStep({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {services.map((s) => {
        const selected = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-pressed={selected}
            className={cn(
              "flex items-center gap-4 rounded-xl border p-4 text-right transition-all duration-300",
              selected
                ? "border-primary bg-primary/10 shadow-gold"
                : "border-white/10 hover:border-primary/40 hover:bg-white/5",
            )}
          >
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl border transition-colors",
                selected
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-white/10 text-primary",
              )}
            >
              <s.icon className="size-5" />
            </span>
            <span className="flex-1">
              <span className="block font-medium">{s.name}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {s.durationMin} דק׳
              </span>
            </span>
            <span className="font-display font-bold text-gold-gradient">
              {formatPrice(s.price)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Barber step ------------------------------ */
export function BarberStep({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {team.map((b) => {
        const selected = value === b.id;
        const isAny = b.id === "any";
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            aria-pressed={selected}
            className={cn(
              "flex items-center gap-4 rounded-xl border p-3 text-right transition-all duration-300",
              selected
                ? "border-primary bg-primary/10 shadow-gold"
                : "border-white/10 hover:border-primary/40 hover:bg-white/5",
            )}
          >
            <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-white/10">
              {isAny ? (
                <span className="grid h-full w-full place-items-center bg-primary/10 text-primary">
                  <Check className="size-5" />
                </span>
              ) : (
                <SmartImage
                  src={b.image}
                  alt={b.name}
                  fallbackLabel={b.name.charAt(0)}
                  sizes="48px"
                />
              )}
            </span>
            <span className="flex-1">
              <span className="block font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">{b.role}</span>
            </span>
            {!isAny ? (
              <StarRating value={b.rating} size={12} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Date step ------------------------------- */
export function DateStep({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (key: string) => void;
}) {
  const days = React.useMemo(() => upcomingDays(14), []);
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
      {days.map(({ key, date }) => {
        const selected = value === key;
        const weekday = new Intl.DateTimeFormat("he-IL", {
          weekday: "short",
        }).format(date);
        const dayNum = date.getDate();
        const month = new Intl.DateTimeFormat("he-IL", {
          month: "short",
        }).format(date);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-pressed={selected}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl border py-3 transition-all duration-300",
              selected
                ? "border-primary bg-primary/10 shadow-gold"
                : "border-white/10 hover:border-primary/40 hover:bg-white/5",
            )}
          >
            <span className="text-xs text-muted-foreground">{weekday}</span>
            <span className="font-display text-xl font-bold">{dayNum}</span>
            <span className="text-[10px] text-muted-foreground">{month}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Time step ------------------------------- */
export function TimeStep({
  times,
  loading,
  closed,
  error,
  value,
  onSelect,
}: {
  times: string[];
  loading: boolean;
  closed: boolean;
  error: string | null;
  value: string | null;
  onSelect: (time: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-primary" />
        טוען שעות פנויות…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <AlertCircle className="size-7 text-destructive" />
        {error}
      </div>
    );
  }
  if (closed || times.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <CalendarX className="size-7 text-primary" />
        אין שעות פנויות בתאריך זה. אנא בחר/י תאריך אחר.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
      {times.map((t) => {
        const selected = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            aria-pressed={selected}
            className={cn(
              "rounded-xl border py-2.5 text-sm font-medium tabular-nums transition-all duration-300",
              selected
                ? "border-transparent bg-gold-gradient text-primary-foreground shadow-gold"
                : "border-white/10 hover:border-primary/40 hover:bg-white/5",
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- Details step ----------------------------- */
export function DetailsStep({
  draft,
  errors,
  onChange,
}: {
  draft: BookingDraft;
  errors: Partial<Record<keyof BookingDraft, string>>;
  onChange: (patch: Partial<BookingDraft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <Field label="שם מלא" error={errors.name} htmlFor="bk-name">
        <Input
          id="bk-name"
          value={draft.name}
          autoComplete="name"
          placeholder="ישראל ישראלי"
          onChange={(e) => onChange({ name: e.target.value })}
          aria-invalid={Boolean(errors.name)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="טלפון" error={errors.phone} htmlFor="bk-phone">
          <Input
            id="bk-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="text-right"
            autoComplete="tel"
            placeholder="050-1234567"
            value={draft.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            aria-invalid={Boolean(errors.phone)}
          />
        </Field>
        <Field label="אימייל" error={errors.email} htmlFor="bk-email">
          <Input
            id="bk-email"
            type="email"
            dir="ltr"
            className="text-right"
            autoComplete="email"
            placeholder="you@email.com"
            value={draft.email}
            onChange={(e) => onChange({ email: e.target.value })}
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
      </div>

      <Field label="הערות (אופציונלי)" htmlFor="bk-notes">
        <Textarea
          id="bk-notes"
          value={draft.notes}
          placeholder="בקשות מיוחדות, סגנון מועדף וכו׳"
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
