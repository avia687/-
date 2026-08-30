// Analytics abstraction.
// Swap the sink for a real provider (PostHog, Segment, GA4…) without touching
// call sites. Server-safe and client-safe.

export type AnalyticsEvent =
  | "signup_started"
  | "signup_completed"
  | "onboarding_completed"
  | "analysis_started"
  | "analysis_completed"
  | "listing_generated"
  | "listing_copied"
  | "negotiation_generated"
  | "product_saved"
  | "upgrade_clicked"
  | "checkout_started"
  | "subscription_started"
  | "subscription_cancelled";

type Props = Record<string, string | number | boolean | null | undefined>;

function sink(event: AnalyticsEvent, props?: Props) {
  // Development sink: structured console output. Replace with a real client.
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, props ?? {});
  }
}

export function track(event: AnalyticsEvent, props?: Props) {
  try {
    sink(event, props);
  } catch {
    /* analytics must never break the app */
  }
}

/** Client helper: fire-and-forget from the browser. */
export function trackClient(event: AnalyticsEvent, props?: Props) {
  if (typeof window === "undefined") return;
  track(event, props);
}
