"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Select } from "@/components/ui/primitives";
import { EmptyState, LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/utils";
import { Plus, Star, Link as LinkIcon } from "lucide-react";

type Review = { id: string; rating?: number | null; comment?: string | null; publicToken: string; requestedAt: string; submittedAt?: string | null; customer?: { name: string } | null };
type Customer = { id: string; name: string };

export default function ReviewsPage() {
  const toast = useToast();
  const [rows, setRows] = React.useState<Review[] | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [customerId, setCustomerId] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    const [r, c] = await Promise.all([
      api<{ reviews: Review[] }>("/api/reviews"),
      api<{ customers: Customer[] }>("/api/customers"),
    ]);
    setRows(r.reviews);
    setCustomers(c.customers);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const submitted = (rows ?? []).filter((r) => r.rating);
  const avg = submitted.length ? submitted.reduce((a, r) => a + (r.rating ?? 0), 0) / submitted.length : 0;

  async function createRequest() {
    setCreating(true);
    try {
      const { review } = await api<{ review: Review }>("/api/reviews", { method: "POST", body: { customerId: customerId || null } });
      const url = `${window.location.origin}/review/${review.publicToken}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast("נוצרה בקשת ביקורת — הקישור הועתק");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setCreating(false);
    }
  }
  function copyLink(token: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/review/${token}`);
    toast("הקישור הועתק");
  }

  return (
    <div>
      <PageHeader title="ביקורות" subtitle="בקש ביקורות ועקוב אחר הדירוג שלך" />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          <div className="text-center">
            <p className="text-3xl font-bold">{avg.toFixed(1)}</p>
            <div className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={avg >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />)}</div>
            <p className="mt-1 text-xs text-muted-foreground">{submitted.length} ביקורות</p>
          </div>
          <div className="flex flex-1 items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">בקש ביקורת מלקוח</label>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">— בחר לקוח (אופציונלי) —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <Button onClick={createRequest} disabled={creating}><Plus size={16} /> צור קישור</Button>
          </div>
        </CardContent>
      </Card>

      {rows === null ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState icon={Star} title="אין ביקורות עדיין" description="צור בקשת ביקורת ראשונה" />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-3 pt-5">
                <div className="flex-1">
                  {r.rating ? (
                    <div className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={15} className={r.rating! >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"} />)}</div>
                  ) : (
                    <span className="text-sm text-amber-600">ממתין לתשובה</span>
                  )}
                  {r.comment && <p className="mt-1 text-sm text-muted-foreground">{r.comment}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.customer?.name ?? ""} · {formatDate(r.submittedAt ?? r.requestedAt)}</p>
                </div>
                {!r.submittedAt && (
                  <button onClick={() => copyLink(r.publicToken)} className="rounded p-2 text-muted-foreground hover:bg-secondary"><LinkIcon size={15} /></button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
