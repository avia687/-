import { prisma } from "@/lib/db";
import { monthlyLimit } from "@/lib/billing/plans";
import { currentPeriod } from "@/lib/utils";
import { ApiError } from "@/lib/session-guards";

export type UsageStatus = {
  plan: string;
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
  period: string;
};

/** Read the current billing period usage + plan for a user. */
export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const period = currentPeriod();
  const [sub, usage] = await Promise.all([
    prisma.subscription.findUnique({ where: { userId } }),
    prisma.usage.findUnique({
      where: { userId_period: { userId, period } },
    }),
  ]);

  const plan = sub?.plan ?? "free";
  const limit = monthlyLimit(plan);
  const used = usage?.analysesUsed ?? 0;
  const remaining = limit === null ? null : Math.max(0, limit - used);

  return { plan, used, limit, remaining, period };
}

/** Throws ApiError(402) if the user has no analyses left this period. */
export async function assertCanAnalyze(userId: string): Promise<UsageStatus> {
  const status = await getUsageStatus(userId);
  if (status.limit !== null && status.used >= status.limit) {
    throw new ApiError(
      402,
      `הגעת למכסת ${status.limit} הניתוחים החינמיים לחודש`,
      "limit_reached",
    );
  }
  return status;
}

/** Atomically increment the usage counter for the current period. */
export async function incrementUsage(userId: string): Promise<void> {
  const period = currentPeriod();
  await prisma.usage.upsert({
    where: { userId_period: { userId, period } },
    update: { analysesUsed: { increment: 1 } },
    create: { userId, period, analysesUsed: 1 },
  });
}
