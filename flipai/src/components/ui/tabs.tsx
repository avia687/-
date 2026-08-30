"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type TabItem = { value: string; label: string; count?: number };

export function Tabs({
  items,
  value,
  onValueChange,
  className,
  size = "md",
}: {
  items: TabItem[];
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const layoutId = React.useId();
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-muted p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative rounded-lg font-medium transition-colors",
              size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2 text-sm",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-bg-${layoutId}`}
                className="absolute inset-0 rounded-lg bg-card shadow-xs"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {item.label}
              {typeof item.count === "number" && (
                <span
                  className={cn(
                    "num rounded-full px-1.5 text-[11px] font-semibold",
                    active
                      ? "bg-primary/12 text-primary"
                      : "bg-foreground/8 text-muted-foreground",
                  )}
                >
                  {item.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
