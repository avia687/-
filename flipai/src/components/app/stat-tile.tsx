"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "default",
  index = 0,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "primary";
  index?: number;
}) {
  const toneClass = {
    default: "text-muted-foreground bg-muted",
    success: "text-success bg-success/12",
    primary: "text-primary bg-accent",
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="rounded-xl border bg-card p-4 shadow-soft"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            toneClass,
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="num mt-2 font-display text-2xl font-extrabold tracking-tight">
        {value}
      </div>
    </motion.div>
  );
}
