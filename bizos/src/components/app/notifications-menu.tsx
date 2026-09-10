"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/utils";

type Notif = { id: string; type: string; title: string; body?: string | null; link?: string | null; read: boolean; createdAt: string };

export function NotificationsMenu() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Notif[]>([]);
  const ref = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ notifications: Notif[] }>("/api/notifications");
      setItems(data.notifications);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markAll = async () => {
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    await api("/api/notifications", { method: "POST", body: { action: "read_all" } }).catch(() => {});
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) markAll();
        }}
        className="relative rounded-md p-2 hover:bg-secondary"
        aria-label="התראות"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-80 rounded-xl border bg-card p-2 shadow-lg animate-fade-in">
          <p className="px-2 py-1.5 text-sm font-semibold">התראות</p>
          <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
            {items.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">אין התראות חדשות</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
                className="block w-full rounded-lg px-2 py-2 text-right hover:bg-secondary"
              >
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(n.createdAt, true)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
