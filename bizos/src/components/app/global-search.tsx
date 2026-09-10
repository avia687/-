"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/states";
import { api } from "@/lib/client";
import { Search } from "lucide-react";

type Result = { type: string; label: string; sublabel?: string; href: string; icon: string };

// Global search across customers, leads, quotes, jobs, payments.
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      setQ("");
      setResults([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ results: Result[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Dialog open={open} onClose={onClose} className="sm:max-w-xl">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <Search size={18} className="text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חפש לקוחות, לידים, הצעות מחיר, עבודות..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {loading && <Spinner className="h-4 w-4" />}
      </div>
      <div className="mt-3 max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => go(r.href)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right text-sm hover:bg-secondary"
          >
            <Icon name={r.icon} size={16} className="text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.label}</p>
              {r.sublabel && <p className="truncate text-xs text-muted-foreground">{r.sublabel}</p>}
            </div>
            <span className="text-xs text-muted-foreground">{r.type}</span>
          </button>
        ))}
        {q.trim() && !loading && results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</p>
        )}
      </div>
    </Dialog>
  );
}
