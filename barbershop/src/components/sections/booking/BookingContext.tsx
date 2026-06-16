"use client";

import * as React from "react";
import type { BookingDraft } from "@/lib/types";

const emptyDraft: BookingDraft = {
  serviceId: null,
  barberId: null,
  date: null,
  time: null,
  name: "",
  phone: "",
  email: "",
  notes: "",
};

interface BookingContextValue {
  draft: BookingDraft;
  step: number;
  setStep: (step: number) => void;
  update: (patch: Partial<BookingDraft>) => void;
  reset: () => void;
  /** Pre-select a service and jump into the booking flow. */
  chooseService: (serviceId: string) => void;
  /** Pre-select a barber and jump into the booking flow. */
  chooseBarber: (barberId: string) => void;
}

const BookingContext = React.createContext<BookingContextValue | null>(null);

function scrollToBooking() {
  document.querySelector("#booking")?.scrollIntoView({ behavior: "smooth" });
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = React.useState<BookingDraft>(emptyDraft);
  const [step, setStep] = React.useState(0);

  const update = React.useCallback((patch: Partial<BookingDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = React.useCallback(() => {
    setDraft(emptyDraft);
    setStep(0);
  }, []);

  const chooseService = React.useCallback((serviceId: string) => {
    setDraft((prev) => ({ ...prev, serviceId }));
    setStep(1);
    requestAnimationFrame(scrollToBooking);
  }, []);

  const chooseBarber = React.useCallback((barberId: string) => {
    setDraft((prev) => ({ ...prev, barberId }));
    setStep((s) => Math.max(s, 2));
    requestAnimationFrame(scrollToBooking);
  }, []);

  const value = React.useMemo(
    () => ({ draft, step, setStep, update, reset, chooseService, chooseBarber }),
    [draft, step, update, reset, chooseService, chooseBarber],
  );

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = React.useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
}
