import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/primitives";
import { PageHeader } from "@/components/app/page-header";
import { Building2, Users, MessageSquare, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isPlatformAdmin())) redirect("/dashboard");

  const [orgs, users, quotes, aiMessages, recentOrgs] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.quote.count(),
    prisma.aIMessage.count(),
    prisma.organization.findMany({
      include: { profile: true, subscription: true, _count: { select: { members: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const cards = [
    { label: "עסקים", value: orgs, icon: Building2 },
    { label: "משתמשים", value: users, icon: Users },
    { label: "הצעות מחיר", value: quotes, icon: FileText },
    { label: "הודעות AI", value: aiMessages, icon: MessageSquare },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="ניהול פלטפורמה" subtitle="סטטיסטיקות ברמת ה-SaaS" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-5">
              <c.icon className="mb-2 text-primary" size={20} />
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="mb-3 font-semibold">עסקים אחרונים</p>
          <div className="divide-y">
            {recentOrgs.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{o.profile?.name ?? o.slug}</p>
                  <p className="text-xs text-muted-foreground">{o.profile?.businessType ?? "—"} · {o._count.members} משתמשים</p>
                </div>
                <span className="text-xs uppercase text-muted-foreground">{o.subscription?.plan ?? "free"}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
