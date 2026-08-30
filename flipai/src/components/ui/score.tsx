"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Circular deal-score ring (value out of 10). */
export function ScoreRing({
  value,
  size = 120,
  label,
  className,
}: {
  value: number; // 0-10
  size?: number;
  label?: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(10, value));
  const stroke = size < 90 ? 7 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 10) * c;

  const tone =
    v >= 8
      ? "hsl(var(--success))"
      : v >= 6
        ? "hsl(var(--primary))"
        : v >= 4
          ? "hsl(var(--warning))"
          : "hsl(var(--destructive))";

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 rtl:rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num font-display text-2xl font-extrabold leading-none">
          {v.toFixed(1)}
        </span>
        {label && (
          <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

/** Horizontal labelled score bar (0-10). */
export function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number; // 0-10
}) {
  const v = Math.max(0, Math.min(10, value));
  const pct = (v / 10) * 100;
  const tone =
    v >= 8 ? "bg-success" : v >= 6 ? "bg-primary" : v >= 4 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="num font-semibold">{v.toFixed(1)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className={cn("h-full rounded-full", tone)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
