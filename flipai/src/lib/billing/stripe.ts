import { prisma } from "@/lib/db";
import { PLANS } from "@/lib/billing/plans";
import type {
  BillingProvider,
  CheckoutArgs,
  CheckoutResult,
} from "@/lib/billing/provider";

/**
 * Stripe billing via the REST API (no SDK dependency). Active when
 * STRIPE_SECRET_KEY is set. Fulfillment happens in the webhook
 * (see /api/billing/webhook). Price ids come from env (STRIPE_PRICE_*).
 */
const STRIPE_API = "https://api.stripe.com/v1";

function form(params: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) body.append(k, v);
  return body.toString();
}

async function stripeFetch(pathname: string, body: string) {
  const res = await fetch(`${STRIPE_API}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Stripe ${res.status}: ${data?.error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe" as const;

  async createCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
    const plan = PLANS[args.plan];
    const priceId = plan.stripePriceEnv
      ? process.env[plan.stripePriceEnv]
      : undefined;
    if (!priceId) {
      throw new Error(
        `Missing Stripe price id for plan "${args.plan}" (env ${plan.stripePriceEnv})`,
      );
    }

    const session = await stripeFetch(
      "/checkout/sessions",
      form({
        mode: "subscription",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${args.successUrl}?upgraded=${args.plan}`,
        cancel_url: args.cancelUrl,
        customer_email: args.email,
        client_reference_id: args.userId,
        "metadata[userId]": args.userId,
        "metadata[plan]": args.plan,
        "subscription_data[metadata][userId]": args.userId,
        "subscription_data[metadata][plan]": args.plan,
      }),
    );

    return { url: session.url as string, applied: false };
  }

  async cancel(userId: string): Promise<void> {
    const sub = await prisma.subscription.findUnique({ where: { userId } });
    if (sub?.providerSubId) {
      // Cancel at period end so the user keeps access until it lapses.
      await stripeFetch(
        `/subscriptions/${sub.providerSubId}`,
        form({ cancel_at_period_end: "true" }),
      ).catch((e) => console.error("[stripe] cancel failed:", e));
    }
    await prisma.subscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true, status: "canceled" },
    });
  }
}
