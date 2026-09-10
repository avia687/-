"use client";

import * as React from "react";
import type { BusinessConfig, Terminology } from "@/lib/business/types";

// Client-side access to the resolved business config so every screen renders
// tenant-correct wording without importing server code.

type BusinessContextValue = {
  config: BusinessConfig;
  businessName: string;
  currency: string;
  role: string;
  plan: string;
};

const BusinessContext = React.createContext<BusinessContextValue | null>(null);

export function BusinessProvider({
  value,
  children,
}: {
  value: BusinessContextValue;
  children: React.ReactNode;
}) {
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = React.useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within BusinessProvider");
  return ctx;
}

/** Render a single term, e.g. <Term k="jobs" />. `cap` capitalizes nothing in Hebrew but kept for API parity. */
export function Term({ k }: { k: keyof Terminology }) {
  const { config } = useBusiness();
  return <>{config.terminology[k]}</>;
}

export function useTerm() {
  const { config } = useBusiness();
  return (k: keyof Terminology) => config.terminology[k];
}
