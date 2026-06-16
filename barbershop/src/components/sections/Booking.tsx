"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Button } from "@/components/ui/button";
import { HairLines } from "@/components/effects/HairLines";
import { useBooking } from "@/components/sections/booking/BookingContext";
import { Stepper, stepLabels } from "@/components/sections/booking/Stepper";
import { Summary } from "@/components/sections/booking/Summary";
import { Confirmation } from "@/components/sections/booking/Confirmation";
import {
  ServiceStep,
  BarberStep,
  DateStep,
  TimeStep,
  DetailsStep,
} from "@/components/sections/booking/steps";
import type { Booking as BookingType, BookingDraft } from "@/lib/types";

const stepTitles = [
  "בחר/י את השירות",
  "בחר/י את הספר",
  "בחר/י תאריך",
  "בחר/י שעה",
  "פרטים אישיים",
];

type FieldErrors = Partial<Record<keyof BookingDraft, string>>;

export function Booking() {
  const { draft, step, setStep, update, reset } = useBooking();

  const [times, setTimes] = React.useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  const [availabilityError, setAvailabilityError] = React.useState<string | null>(
    null,
  );

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [confirmed, setConfirmed] = React.useState<{
    booking: BookingType;
    emailSent: boolean;
  } | null>(null);
  const [direction, setDirection] = React.useState(1);

  // How far the user is allowed to navigate (contiguous completed steps).
  const maxReached = React.useMemo(() => {
    let m = 0;
    if (draft.serviceId) m = 1;
    if (draft.serviceId && draft.barberId) m = 2;
    if (draft.serviceId && draft.barberId && draft.date) m = 3;
    if (draft.serviceId && draft.barberId && draft.date && draft.time) m = 4;
    return m;
  }, [draft]);

  // Fetch availability when entering the time step (or when inputs change).
  React.useEffect(() => {
    if (step !== 3 || !draft.date) return;
    const barberId = draft.barberId ?? "any";
    let cancelled = false;
    setLoadingTimes(true);
    setAvailabilityError(null);

    fetch(`/api/availability?date=${draft.date}&barberId=${barberId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.ok) {
          setAvailabilityError(data.error ?? "שגיאה בטעינת השעות");
          setTimes([]);
          return;
        }
        setClosed(Boolean(data.closed));
        setTimes(data.times ?? []);
        // If the previously selected time is gone, clear it.
        if (draft.time && !data.times?.includes(draft.time)) {
          update({ time: null });
        }
      })
      .catch(() => {
        if (!cancelled) setAvailabilityError("שגיאת רשת. נסה/י שוב.");
      })
      .finally(() => !cancelled && setLoadingTimes(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft.date, draft.barberId]);

  const goTo = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  const canProceed = React.useMemo(() => {
    if (step === 0) return Boolean(draft.serviceId);
    if (step === 1) return Boolean(draft.barberId);
    if (step === 2) return Boolean(draft.date);
    if (step === 3) return Boolean(draft.time);
    return true;
  }, [step, draft]);

  const validateDetails = (): boolean => {
    const next: FieldErrors = {};
    if (draft.name.trim().length < 2) next.name = "יש להזין שם מלא";
    const phone = draft.phone.replace(/[\s-]/g, "");
    if (!/^0(5\d|[2-489])\d{7}$/.test(phone)) next.phone = "מספר טלפון לא תקין";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
      next.email = "כתובת אימייל לא תקינה";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validateDetails()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setConfirmed({ booking: data.booking, emailSent: Boolean(data.emailSent) });
      } else if (res.status === 409) {
        setSubmitError(data.error);
        update({ time: null });
        goTo(3);
      } else {
        setSubmitError(data.error ?? "אירעה שגיאה. נסה/י שוב.");
      }
    } catch {
      setSubmitError("שגיאת רשת. בדוק/י את החיבור ונסה/י שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    reset();
    setConfirmed(null);
    setErrors({});
    setSubmitError(null);
    setTimes([]);
  };

  return (
    <section
      id="booking"
      className="relative overflow-hidden py-24 md:py-32"
    >
      <div className="absolute inset-0 bg-[radial-gradient(100%_80%_at_50%_0%,#141418_0%,#0c0c0e_60%)]" />
      <HairLines className="opacity-30" count={16} opacity={0.3} />

      <div className="container-edge relative">
        <SectionHeading
          eyebrow="קביעת תור"
          title={
            <>
              הזמן את <span className="text-gold-gradient">החוויה</span> שלך
            </>
          }
          description="תהליך הזמנה פשוט ומהיר ב-5 שלבים. בחר/י שירות, ספר, מועד — וזהו."
        />

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
          <div className="glass rounded-3xl p-6 sm:p-8">
            {confirmed ? (
              <Confirmation
                booking={confirmed.booking}
                emailSent={confirmed.emailSent}
                onReset={handleReset}
              />
            ) : (
              <>
                <Stepper current={step} maxReached={maxReached} onSelect={goTo} />

                <div className="mt-8">
                  <h3 className="mb-5 font-display text-xl font-semibold">
                    {stepTitles[step]}
                  </h3>

                  <div className="relative overflow-hidden">
                    <AnimatePresence mode="wait" custom={direction}>
                      <motion.div
                        key={step}
                        custom={direction}
                        initial={{ opacity: 0, x: direction * 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction * -40 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {step === 0 && (
                          <ServiceStep
                            value={draft.serviceId}
                            onSelect={(id) => {
                              update({ serviceId: id });
                              goTo(1);
                            }}
                          />
                        )}
                        {step === 1 && (
                          <BarberStep
                            value={draft.barberId}
                            onSelect={(id) => {
                              update({ barberId: id });
                              goTo(2);
                            }}
                          />
                        )}
                        {step === 2 && (
                          <DateStep
                            value={draft.date}
                            onSelect={(key) => {
                              update({ date: key, time: null });
                              goTo(3);
                            }}
                          />
                        )}
                        {step === 3 && (
                          <TimeStep
                            times={times}
                            loading={loadingTimes}
                            closed={closed}
                            error={availabilityError}
                            value={draft.time}
                            onSelect={(t) => update({ time: t })}
                          />
                        )}
                        {step === 4 && (
                          <DetailsStep
                            draft={draft}
                            errors={errors}
                            onChange={(patch) => {
                              update(patch);
                              setErrors({});
                            }}
                          />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {submitError ? (
                    <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                      {submitError}
                    </p>
                  ) : null}

                  {/* Navigation */}
                  <div className="mt-8 flex items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => goTo(Math.max(0, step - 1))}
                      disabled={step === 0}
                      className={step === 0 ? "invisible" : ""}
                    >
                      <ArrowRight className="size-4" />
                      חזרה
                    </Button>

                    {step < stepLabels.length - 1 ? (
                      <Button onClick={() => goTo(step + 1)} disabled={!canProceed}>
                        המשך
                        <ArrowLeft className="size-4" />
                      </Button>
                    ) : (
                      <Button onClick={submit} disabled={submitting} size="lg">
                        {submitting ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            מאשר…
                          </>
                        ) : (
                          "אישור והזמנה"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Summary sidebar */}
          {!confirmed ? (
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Summary draft={draft} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
