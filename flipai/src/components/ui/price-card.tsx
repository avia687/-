"use client";

import { motion } from "framer-motion";
import { Zap, Target, TrendingUp } from "lucide-react";
import { cn, formatILS } from "@/lib/utils";

type Tier = "quick" | "recommended" | "max";

const config: Record<
  Tier,
  { label: string; hint: string; icon: React.ReactNode }
> = {
  quick: {
    label: "מכירה מהירה",
    hint: "סגירה תוך ימים",
    icon: <Zap className="h-4 w-4" />,
  },
  recommended: {
    label: "מומלץ",
    hint: "האיזון הטוב ביותר",
    icon: <Target className="h-4 w-4" />,
  },
  max: {
    label: "מקסימום",
    hint: "בסבלנות",
    icon: <TrendingUp className="h-4 w-4" />,
  },
};

export function PriceTierCard({
  tier,
  value,
  featured,
  index = 0,
}: {
  tier: Tier;
  value: number;
  featured?: boolean;
  index?: number;
}) {
  const c = config[tier];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className={cn(
        "relative rounded-xl border p-4 text-center transition-colors",
        featured
          ? "border-primary bg-accent/60 shadow-accent"
          : "bg-card",
      )}
    >
      <div
        className={cn(
          "mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          featured
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {c.icon}
        {c.label}
      </div>
      <div className="num font-display text-2xl font-extrabold tracking-tight">
        {formatILS(value)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>
    </motion.div>
  );
}

export function PriceTiers({
  quick,
  recommended,
  max,
}: {
  quick: number;
  recommended: number;
  max: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <PriceTierCard tier="quick" value={quick} index={0} />
      <PriceTierCard tier="recommended" value={recommended} featured index={1} />
      <PriceTierCard tier="max" value={max} index={2} />
    </div>
  );
}
