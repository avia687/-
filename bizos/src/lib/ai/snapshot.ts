import { prisma } from "@/lib/db";
import { resolveConfig } from "@/lib/business/resolve";
import { startOfDay, addDays } from "@/lib/utils";
import type { BusinessSnapshot } from "@/lib/ai/types";

/**
 * Builds a BusinessSnapshot from real tenant data. This is the only thing the
 * AI is allowed to reason from — it guarantees answers are grounded, not
 * invented.
 */
export async function buildSnapshot(organizationId: string): Promise<BusinessSnapshot> {
  const profile = await prisma.businessProfile.findUnique({ where: { organizationId } });
  const config = resolveConfig(profile);
  const currency = profile?.currency ?? "ILS";

  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const weekAhead = addDays(today, 7);

  const [services, todayJobs, upcomingJobs, openQuotes, payments, leads, monthJobs, reviews] =
    await Promise.all([
      prisma.service.findMany({ where: { organizationId, active: true }, orderBy: { price: "desc" } }),
      prisma.job.findMany({
        where: { organizationId, startAt: { gte: today, lt: tomorrow } },
        include: { customer: true },
        orderBy: { startAt: "asc" },
      }),
      prisma.job.findMany({
        where: { organizationId, startAt: { gte: tomorrow, lt: weekAhead } },
        include: { customer: true },
        orderBy: { startAt: "asc" },
        take: 10,
      }),
      prisma.quote.findMany({
        where: { organizationId, status: { in: ["sent", "draft"] } },
        include: { customer: true },
      }),
      prisma.payment.findMany({
        where: { organizationId, status: { in: ["pending", "partial", "overdue"] } },
        include: { customer: true },
      }),
      prisma.lead.findMany({
        where: { organizationId, status: { notIn: ["won", "lost"] } },
        orderBy: [{ probability: "desc" }, { value: "desc" }],
        take: 5,
      }),
      prisma.job.findMany({
        where: { organizationId, startAt: { gte: monthStart } },
        select: { price: true, serviceName: true, status: true },
      }),
      prisma.review.findMany({ where: { organizationId, submittedAt: null } }),
    ]);

  // Top service by month revenue.
  const revByService = new Map<string, number>();
  for (const j of monthJobs) {
    if (!j.serviceName) continue;
    revByService.set(j.serviceName, (revByService.get(j.serviceName) ?? 0) + j.price);
  }
  let topService: BusinessSnapshot["stats"]["topService"];
  for (const [name, revenue] of revByService) {
    if (!topService || revenue > topService.revenue) topService = { name, revenue };
  }

  const revenueMonth = monthJobs
    .filter((j) => j.status !== "cancelled")
    .reduce((a, j) => a + j.price, 0);

  return {
    businessName: profile?.name ?? "העסק שלי",
    businessType: config.label,
    currency,
    aiInstructions: config.aiInstructions,
    terminology: config.terminology,
    services: services.map((s) => ({ name: s.name, price: s.price, category: s.category ?? undefined })),
    todayJobs: todayJobs.map((j) => ({
      title: j.title,
      time: new Date(j.startAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      customer: j.customer?.name,
      status: j.status,
    })),
    upcomingJobs: upcomingJobs.map((j) => ({
      title: j.title,
      date: new Date(j.startAt).toLocaleDateString("he-IL"),
      customer: j.customer?.name,
    })),
    openQuotes: openQuotes.map((q) => ({ customer: q.customer?.name, total: q.total, status: q.status })),
    outstandingPayments: payments.map((p) => ({ customer: p.customer?.name, amount: p.amount, status: p.status })),
    hotLeads: leads.map((l) => ({ title: l.title, value: l.value, probability: l.probability })),
    stats: {
      revenueMonth,
      jobsMonth: monthJobs.length,
      newLeads: leads.length,
      topService,
      missingReviews: reviews.length,
    },
  };
}
