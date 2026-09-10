import { prisma } from "@/lib/db";
import { startOfDay, addDays } from "@/lib/utils";

export type DashboardStats = {
  revenueToday: number;
  revenueWeek: number;
  revenueMonth: number;
  estimatedProfit: number;
  jobsCount: number;
  newLeads: number;
  newCustomers: number;
  openQuotes: number;
  outstanding: number;
  upcomingJobs: { id: string; title: string; startAt: string; customer?: string; status: string }[];
  revenueSeries: { label: string; value: number }[];
  jobsSeries: { label: string; value: number }[];
  leadSources: { name: string; value: number }[];
  topServices: { name: string; value: number }[];
};

const DONE = ["done", "scheduled", "in_progress"];

export async function getDashboardStats(organizationId: string): Promise<DashboardStats> {
  const today = startOfDay();
  const weekStart = addDays(today, -6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const in30 = addDays(today, 1);

  const [jobs, monthExpenses, leads, newCustomers, openQuotes, payments, upcoming] =
    await Promise.all([
      prisma.job.findMany({
        where: { organizationId, startAt: { gte: addDays(today, -30) } },
        include: { customer: true },
      }),
      prisma.expense.aggregate({
        where: { organizationId, spentAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.lead.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      prisma.customer.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
      prisma.quote.count({ where: { organizationId, status: { in: ["sent", "draft"] } } }),
      prisma.payment.aggregate({
        where: { organizationId, status: { in: ["pending", "partial", "overdue"] } },
        _sum: { amount: true },
      }),
      prisma.job.findMany({
        where: { organizationId, startAt: { gte: today }, status: { not: "cancelled" } },
        include: { customer: true },
        orderBy: { startAt: "asc" },
        take: 6,
      }),
    ]);

  const active = jobs.filter((j) => j.status !== "cancelled");
  const sum = (from: Date) =>
    active.filter((j) => j.startAt >= from).reduce((a, j) => a + j.price, 0);

  const revenueMonth = active.filter((j) => j.startAt >= monthStart).reduce((a, j) => a + j.price, 0);
  const monthCost = active
    .filter((j) => j.startAt >= monthStart)
    .reduce((a, j) => a + j.price * 0.15, 0); // rough service-cost proxy
  const estimatedProfit = revenueMonth - (monthExpenses._sum.amount ?? 0) - monthCost;

  // 7-day revenue + jobs series.
  const revenueSeries: { label: string; value: number }[] = [];
  const jobsSeries: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const next = addDays(day, 1);
    const dayJobs = active.filter((j) => j.startAt >= day && j.startAt < next);
    const label = day.toLocaleDateString("he-IL", { weekday: "short" });
    revenueSeries.push({ label, value: dayJobs.reduce((a, j) => a + j.price, 0) });
    jobsSeries.push({ label, value: dayJobs.length });
  }

  // Lead sources (month).
  const leadRows = await prisma.lead.findMany({
    where: { organizationId, createdAt: { gte: monthStart } },
    select: { source: true },
  });
  const sourceMap = new Map<string, number>();
  for (const l of leadRows) {
    const key = l.source || "אחר";
    sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
  }
  const leadSources = [...sourceMap.entries()].map(([name, value]) => ({ name, value }));

  // Top services by revenue (month).
  const svcMap = new Map<string, number>();
  for (const j of active.filter((x) => x.startAt >= monthStart)) {
    if (!j.serviceName) continue;
    svcMap.set(j.serviceName, (svcMap.get(j.serviceName) ?? 0) + j.price);
  }
  const topServices = [...svcMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    revenueToday: sum(today),
    revenueWeek: sum(weekStart),
    revenueMonth,
    estimatedProfit,
    jobsCount: active.filter((j) => j.startAt >= today && j.startAt < in30 && DONE.includes(j.status)).length,
    newLeads: leads,
    newCustomers,
    openQuotes,
    outstanding: payments._sum.amount ?? 0,
    upcomingJobs: upcoming.map((j) => ({
      id: j.id,
      title: j.title,
      startAt: j.startAt.toISOString(),
      customer: j.customer?.name,
      status: j.status,
    })),
    revenueSeries,
    jobsSeries,
    leadSources,
    topServices,
  };
}
