import { prisma } from "@/lib/db";
import type {
  BillingProvider,
  CheckoutArgs,
  CheckoutResult,
} from "@/lib/billing/provider";

/**
 * Simulated billing provider. Applies the plan change immediately (no real
 * payment) and returns our own success URL. Used automatically when no Stripe
 * key is configured, so the whole upgrade/cancel flow is exercisable in dev.
 */
export class MockBillingProvider implements BillingProvider {
  readonly name = "mock" as const;

  async createCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.subscription.upsert({
      where: { userId: args.userId },
      update: {
        plan: args.plan,
        status: "active",
        provider: "mock",
        periodStart: now,
        periodEnd,
        cancelAtPeriodEnd: false,
      },
      create: {
        userId: args.userId,
        plan: args.plan,
        status: "active",
        provider: "mock",
        periodStart: now,
        periodEnd,
      },
    });

    const url = new URL(args.successUrl);
    url.searchParams.set("upgraded", args.plan);
    url.searchParams.set("simulated", "1");
    return { url: url.toString(), applied: true };
  }

  async cancel(userId: string): Promise<void> {
    await prisma.subscription.update({
      where: { userId },
      data: { plan: "free", status: "canceled", cancelAtPeriodEnd: true },
    });
  }
}
