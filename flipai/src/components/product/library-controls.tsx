"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

const SORTS = [
  { value: "newest", label: "החדשים ביותר" },
  { value: "value", label: "שווי גבוה" },
  { value: "profit", label: "רווח פוטנציאלי" },
  { value: "score", label: "ציון עסקה" },
];

export function LibraryControls({
  counts,
}: {
  counts: { all: number; active: number; sold: number; draft: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const status = params.get("status") || "all";
  const sort = params.get("sort") || "newest";
  const [q, setQ] = React.useState(params.get("q") || "");

  const update = React.useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [params, pathname, router],
  );

  // Debounced search
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") || "") !== q) update({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש מוצר…"
          className="pe-9"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="overflow-x-auto">
          <Tabs
            size="sm"
            value={status}
            onValueChange={(v) => update({ status: v === "all" ? "" : v })}
            items={[
              { value: "all", label: "הכל", count: counts.all },
              { value: "active", label: "פעיל", count: counts.active },
              { value: "sold", label: "נמכר", count: counts.sold },
              { value: "draft", label: "טיוטות", count: counts.draft },
            ]}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="מיון"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
