import Link from "next/link";
import type { Metadata } from "next";
import { Package, Wallet, Radio, TrendingUp, Plus, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import { getUsageStatus } from "@/lib/usage";
import { StatTile } from "@/components/app/stat-tile";
import { ProductRow } from "@/components/ui/product-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { UsageMeter } from "@/components/app/usage-meter";
import { formatILS, hebrewGreeting } from "@/lib/utils";

export const metadata: Metadata = { title: "בית" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [data, usage] = await Promise.all([
    getDashboardData(userId),
    getUsageStatus(userId),
  ]);

  const firstName = (session!.user.name || "").split(" ")[0] || "מוכר";

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {hebrewGreeting()}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            הנה תמונת המצב של המכירות שלך
          </p>
        </div>
        <Link href="/analyze">
          <Button size="lg">
            <Plus className="h-4 w-4" />
            נתח מוצר
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="מוצרים שנותחו"
          value={String(data.analyzedCount)}
          icon={Package}
          index={0}
        />
        <StatTile
          label="שווי כולל משוער"
          value={formatILS(data.totalValue)}
          icon={Wallet}
          tone="primary"
          index={1}
        />
        <StatTile
          label="מודעות פעילות"
          value={String(data.activeCount)}
          icon={Radio}
          index={2}
        />
        <StatTile
          label="רווח פוטנציאלי"
          value={formatILS(Math.max(0, data.potentialProfit))}
          icon={TrendingUp}
          tone="success"
          index={3}
        />
      </div>

      <div className="mt-4">
        <UsageMeter
          plan={usage.plan}
          used={usage.used}
          limit={usage.limit}
        />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight">
            ניתוחים אחרונים
          </h2>
          {data.recent.length > 0 && (
            <Link
              href="/products"
              className="text-sm font-medium text-primary hover:underline"
            >
              הצג הכל
            </Link>
          )}
        </div>

        {data.recent.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" />}
            title="עדיין אין מוצרים"
            description="נתחו את המוצר הראשון שלכם ותנו ל-AI לעשות את העבודה הקשה — מחיר, מודעה ואסטרטגיה תוך שניות."
            action={
              <Link href="/analyze">
                <Button>
                  <Plus className="h-4 w-4" />
                  נתח מוצר
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {data.recent.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
