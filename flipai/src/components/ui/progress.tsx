"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
  tone = "primary",
}: {
  value: number; // 0-100
  className?: string;
  indicatorClassName?: string;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const toneClass = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  }[tone];

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <motion.div
        className={cn("h-full rounded-full", toneClass, indicatorClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
