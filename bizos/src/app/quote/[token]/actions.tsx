"use client";

import * as React from "react";
import { api } from "@/lib/client";
import { Check, X } from "lucide-react";

export function QuoteActions({ token, status, brand }: { token: string; status: string; brand: string }) {
  const [state, setState] = React.useState(status);
  const [loading, setLoading] = React.useState(false);

  async function act(action: "approve" | "reject") {
    setLoading(true);
    try {
      const res = await api<{ status: string }>(`/api/public/quote/${token}`, { method: "POST", body: { action } });
      setState(res.status);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  if (state === "approved") {
    return (
      <div className="mt-5 rounded-lg bg-green-50 p-4 text-center text-green-700 dark:bg-green-500/10 dark:text-green-300">
        <Check className="mx-auto mb-1" /> ההצעה אושרה! ניצור איתך קשר בהקדם. תודה 🙏
      </div>
    );
  }
  if (state === "rejected") {
    return <div className="mt-5 rounded-lg bg-secondary p-4 text-center text-muted-foreground">ההצעה נדחתה. תודה על העדכון.</div>;
  }

  return (
    <div className="mt-5 flex gap-2">
      <button
        onClick={() => act("approve")}
        disabled={loading}
        className="flex flex-1 items-center justify-center gap-1 rounded-lg py-3 font-medium text-white disabled:opacity-50"
        style={{ background: brand }}
      >
        <Check size={18} /> אישור ההצעה
      </button>
      <button
        onClick={() => act("reject")}
        disabled={loading}
        className="flex items-center justify-center gap-1 rounded-lg border px-4 py-3 font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50"
      >
        <X size={18} /> דחייה
      </button>
    </div>
  );
}
