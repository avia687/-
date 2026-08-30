import type { BillingProvider } from "@/lib/billing/provider";
import { MockBillingProvider } from "@/lib/billing/mock";
import { StripeBillingProvider } from "@/lib/billing/stripe";

let provider: BillingProvider | null = null;

export function isRealBilling() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Returns the active billing provider (Stripe when configured, else mock). */
export function getBilling(): BillingProvider {
  if (provider) return provider;
  provider = isRealBilling()
    ? new StripeBillingProvider()
    : new MockBillingProvider();
  return provider;
}

export { PLANS, PLAN_LIST, planLabel, monthlyLimit } from "@/lib/billing/plans";
export type { PlanId, Plan } from "@/lib/billing/plans";
