import type { PlanId } from "@/lib/billing/plans";

export type CheckoutArgs = {
  userId: string;
  email: string;
  plan: PlanId;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = {
  /** URL to redirect the browser to (Stripe Checkout, or our success page). */
  url: string;
  /** True when the plan change was applied immediately (mock provider). */
  applied: boolean;
};

export interface BillingProvider {
  readonly name: "mock" | "stripe";
  createCheckout(args: CheckoutArgs): Promise<CheckoutResult>;
  cancel(userId: string): Promise<void>;
}
