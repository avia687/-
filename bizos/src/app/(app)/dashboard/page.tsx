import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getDashboardStats } from "@/lib/stats";
import { buildSnapshot } from "@/lib/ai/snapshot";
import { getAI } from "@/lib/ai";
import { resolveConfig } from "@/lib/business/resolve";
import { Card, CardContent } from "@/components/ui/primitives";
import { RevenueChart, JobsChart, DistributionChart } from "@/components/app/dashboard-charts";
import { formatMoney, formatDate } from "@/lib/utils";
import {
  Wallet, CalendarClock, Filter, UserPlus, FileText, TrendingUp, Sparkles, ArrowLeft,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const tenant = await requireTenant();
  const org = tenant.organizationId;
  const profile = await prisma.businessProfile.findUnique({ where: { organizationId: org } });
  const config = resolveConfig(profile);
  const currency = profile?.currency ?? "ILS";

  const [stats, snapshot] = await Promise.all([getDashboardStats(org), buildSnapshot(org)]);
  const briefing = await getAI().ask("מה כדאי לי לעשות היום?", snapshot);

  const kpis = [
    { label: "הכנסות היום", value: formatMoney(stats.revenueToday, currency), icon: Wallet, tone: "text-green-500" },
    { label: "הכנסות החודש", value: formatMoney(stats.revenueMonth, currency), icon: TrendingUp, tone: "text-indigo-500" },
    { label: "רווח משוער (חודש)", value: formatMoney(stats.estimatedProfit, currency), icon: TrendingUp, tone: "text-emerald-500" },
    { label: `${config.terminology.jobs} קרובות`, value: String(stats.jobsCount), icon: CalendarClock, tone: "text-blue-500" },
    { label: `${config.terminology.leads} חדשים`, value: String(stats.newLeads), icon: Filter, tone: "text-violet-500" },
    { label: `${config.terminology.customers} חדשים`, value: String(stats.newCustomers), icon: UserPlus, tone: "text-pink-500" },
    { label: "הצעות פתוחות", value: String(stats.openQuotes), icon: FileText, tone: "text-amber-500" },
    { label: "תשלומים פתוחים", value: formatMoney(stats.outstanding, currency), icon: Wallet, tone: "text-red-500" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">שלום, {profile?.ownerName || profile?.name} 👋</h1>
        <p className="text-sm text-muted-foreground">הנה סקירה של העסק שלך היום</p>
      </div>

      {/* AI briefing */}
      <Card className="border-primary/30 bg-gradient-to-l from-accent to-card">
        <CardContent className="flex items-start gap-3 pt-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">העוזר העסקי שלך</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{briefing.text}</p>
            <Link href="/assistant" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              שאל את ה-AI <ArrowLeft size={14} />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5">
              <k.icon className={`${k.tone} mb-2`} size={20} />
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="mt-0.5 text-xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="הכנסות (7 ימים אחרונים)">
          <RevenueChart data={stats.revenueSeries} />
        </ChartCard>
        <ChartCard title={`${config.terminology.jobs} (7 ימים אחרונים)`}>
          <JobsChart data={stats.jobsSeries} />
        </ChartCard>
        <ChartCard title="מקורות לידים (החודש)">
          <DistributionChart data={stats.leadSources} />
        </ChartCard>
        <ChartCard title="שירותים מובילים (החודש)">
          <DistributionChart data={stats.topServices} />
        </ChartCard>
      </div>

      {/* Upcoming */}
      <ChartCard title={`${config.terminology.jobs} קרובות`}>
        {stats.upcomingJobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">אין {config.terminology.jobs} מתוזמנות</p>
        ) : (
          <ul className="divide-y">
            {stats.upcomingJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{j.title}</p>
                  {j.customer && <p className="text-xs text-muted-foreground">{j.customer}</p>}
                </div>
                <span className="text-muted-foreground">{formatDate(j.startAt, true)}</span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="mb-3 text-sm font-semibold">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}
