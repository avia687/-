// Payment-processing abstraction. Payment *tracking* (who paid, how much) is a
// real feature backed by the Payment model. Actual *charging* is deliberately
// left to a provider interface — no real card processing without a configured
// API. A Stripe/Bit/PayPal adapter implements PaymentProvider and is selected
// in getPaymentProvider() when its env credentials are present.

export type PaymentMethod = "cash" | "card" | "transfer" | "bit" | "paypal" | "other";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "מזומן",
  card: "כרטיס אשראי",
  transfer: "העברה בנקאית",
  bit: "Bit",
  paypal: "PayPal",
  other: "אחר",
};

export type PaymentStatus = "paid" | "pending" | "partial" | "overdue";

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "שולם",
  pending: "ממתין",
  partial: "חלקי",
  overdue: "באיחור",
};

export type ChargeRequest = { amount: number; currency: string; method: PaymentMethod; reference?: string };
export type ChargeResult = { status: "succeeded" | "pending" | "failed"; providerId?: string; error?: string };

export interface PaymentProvider {
  readonly name: string;
  readonly connected: boolean;
  charge(req: ChargeRequest): Promise<ChargeResult>;
}

class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly connected = false;
  async charge(_req: ChargeRequest): Promise<ChargeResult> {
    // No real processing. Manual payment tracking is the source of truth until
    // a real provider is connected.
    return { status: "pending" };
  }
}

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  // e.g. `if (process.env.STRIPE_SECRET_KEY) return new StripeProvider();`
  return (instance ??= new MockPaymentProvider());
}
