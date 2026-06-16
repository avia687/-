"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const stepLabels = ["שירות", "ספר", "תאריך", "שעה", "פרטים"] as const;

export function Stepper({
  current,
  maxReached,
  onSelect,
}: {
  current: number;
  maxReached: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol className="flex items-center justify-between gap-1">
      {stepLabels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= maxReached;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onSelect(i)}
              className="group flex flex-col items-center gap-2 disabled:cursor-not-allowed"
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full border text-sm font-semibold transition-all duration-300",
                  active &&
                    "border-transparent bg-gold-gradient text-primary-foreground shadow-gold",
                  done &&
                    "border-primary/50 bg-primary/15 text-primary",
                  !active && !done && "border-white/10 text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs sm:block",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
            {i < stepLabels.length - 1 ? (
              <span
                className={cn(
                  "mx-1 h-px flex-1 transition-colors duration-500 sm:mx-2",
                  i < current ? "bg-primary/50" : "bg-white/10",
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
