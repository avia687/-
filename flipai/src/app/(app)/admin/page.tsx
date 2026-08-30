import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Users,
  CreditCard,
  Sparkles,
  TrendingUp,
  BarChart3,
  Coins,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/billing/plans";
import { categoryLabels, type Category } from "@/lib/ai/types";
import { formatILS } from "@/lib/utils";

export const metadata: Metadata = { title: "ניהול" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "admin") redirect("/dashboard");

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    paidSubs,
    analysesToday,
    analysesMonth,
    catGroups,
    paidByPlan,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({
      where: { status: "active", plan: { in: ["pro", "seller"] } },
    }),
    prisma.analysis.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.analysis.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.product.groupBy({
      by: ["category"],
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
      take: 5,
    }),
    prisma.subscription.groupBy({
      by: ["plan"],
      where: { status: "active", plan: { in: ["pro", "seller"] } },
      _count: { _all: true },
    }),
  ]);

  const conversion = totalUsers > 0 ? (paidSubs / totalUsers) * 100 : 0;
  const mrr = paidByPlan.reduce((sum, row) => {
    const price = PLANS[row.plan as keyof typeof PLANS]?.price ?? 0;
    return sum + price * row._count._all;
  }, 0);

  const maxCat = Math.max(1, ...catGroups.map((c) => c._count._all));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="פאנל ניהול"
        subtitle="מבט-על על המשתמשים, המנויים והשימוש"
        action={<Badge variant="primary">Admin</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="סה״כ משתמשים" value={String(totalUsers)} icon={Users} index={0} />
        <StatTile
          label="מנויים פעילים"
          value={String(paidSubs)}
          icon={CreditCard}
          tone="primary"
          index={1}
        />
        <StatTile
          label="המרה למנוי"
          value={`${conversion.toFixed(1)}%`}
          icon={TrendingUp}
          tone="success"
          index={2}
        />
        <StatTile label="ניתוחים היום" value={String(analysesToday)} icon={Sparkles} index={3} />
        <StatTile label="ניתוחים החודש" value={String(analysesMonth)} icon={BarChart3} index={4} />
        <StatTile
          label="הכנסה חודשית (MRR)"
          value={formatILS(mrr)}
          icon={Coins}
          tone="success"
          index={5}
        />
      </div>

      <Card className="mt-5">
        <CardContent>
          <h2 className="mb-4 font-display text-lg font-bold tracking-tight">
            קטגוריות מובילות
          </h2>
          {catGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין עדיין נתונים.</p>
          ) : (
            <div className="space-y-3">
              {catGroups.map((c) => {
                const label = c.category
                  ? categoryLabels[c.category as Category] ?? c.category
                  : "ללא קטגוריה";
                const pct = (c._count._all / maxCat) * 100;
                return (
                  <div key={c.category ?? "none"}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{label}</span>
                      <span className="num font-semibold">{c._count._all}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            * נתוני ההכנסה הם הערכה על בסיס המנויים הפעילים (placeholder עד לחיבור
            חיוב אמיתי).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
