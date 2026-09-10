"use client";

import { useRouter } from "next/navigation";
import { RANGE_LABELS, type DateRange } from "@/lib/stats";

// Time-range selector for the dashboard; drives the `?range=` search param so
// the server component recomputes KPIs + charts for the chosen window.
export function RangeTabs({ value }: { value: DateRange }) {
  const router = useRouter();
  const ranges = Object.keys(RANGE_LABELS) as DateRange[];
  return (
    <div className="flex rounded-lg border p-0.5 text-sm">
      {ranges.map((r) => (
        <button
          key={r}
          onClick={() => router.push(`/dashboard?range=${r}`)}
          className={`rounded-md px-3 py-1 ${value === r ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
        >
          {RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}
