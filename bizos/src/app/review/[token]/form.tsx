"use client";

import * as React from "react";
import { api } from "@/lib/client";
import { Star } from "lucide-react";

export function ReviewForm({ token, brand }: { token: string; brand: string }) {
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    if (!rating) return;
    setLoading(true);
    try {
      await api(`/api/public/review/${token}`, { method: "POST", body: { rating, comment } });
      setDone(true);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  if (done) return <p className="py-6 text-muted-foreground">תודה רבה על המשוב! 🙏</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} כוכבים`}
          >
            <Star
              size={34}
              className={(hover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="ספר/י לנו על החוויה (לא חובה)"
        className="min-h-[90px] w-full rounded-lg border bg-card p-3 text-sm outline-none"
      />
      <button
        onClick={submit}
        disabled={!rating || loading}
        className="w-full rounded-lg py-3 font-medium text-white disabled:opacity-50"
        style={{ background: brand }}
      >
        {loading ? "שולח..." : "שליחת ביקורת"}
      </button>
    </div>
  );
}
