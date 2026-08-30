"use client";

import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { planLabel } from "@/lib/billing/plans";

export function UsageMeter({
  plan,
  used,
  limit,
}: {
  plan: string;
  used: number;
  limit: number | null;
}) {
  if (limit === null) {
    return (
      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>
            מסלול <b>{planLabel(plan)}</b> · ניתוחים ללא הגבלה
          </span>
        </div>
        <span className="num text-sm text-muted-foreground">{used} החודש</span>
      </div>
    );
  }

  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const low = remaining <= 1;

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          ניתוחים החודש · מסלול {planLabel(plan)}
        </span>
        <span className="num text-muted-foreground">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-2">
        <Progress value={pct} tone={low ? "warning" : "primary"} />
      </div>
      {low && (
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {remaining === 0
              ? "נגמרו הניתוחים החינמיים לחודש"
              : "נותר ניתוח אחרון החודש"}
          </span>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Zap className="h-3.5 w-3.5" />
            שדרגו ל-Pro
          </Link>
        </div>
      )}
    </div>
  );
}
