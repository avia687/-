"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { calcQuote } from "@/lib/quote";
import { formatMoney, formatDate } from "@/lib/utils";
import { Plus, FileText, Trash2, Link as LinkIcon, Send } from "lucide-react";

type Service = { id: string; name: string; price: number };
type Customer = { id: string; name: string };
type Item = { serviceId?: string | null; name: string; quantity: number; unitPrice: number };
type Quote = {
  id: string;
  number: number;
  status: string;
  total: number;
  publicToken: string;
  createdAt: string;
  customer?: { name: string } | null;
  items: Item[];
};

const STATUS_COLOR: Record<string, string> = {
  draft: "gray",
  sent: "amber",
  approved: "green",
  rejected: "red",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה",
  sent: "נשלחה",
  approved: "אושרה",
  rejected: "נדחתה",
};

export default function QuotesPage() {
  const { currency } = useBusiness();
  const toast = useToast();
  const [quotes, setQuotes] = React.useState<Quote[] | null>(null);
  const [services, setServices] = React.useState<Service[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [customerId, setCustomerId] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [discount, setDiscount] = React.useState(0);
  const [taxRate, setTaxRate] = React.useState(0.17);

  const load = React.useCallback(async () => {
    const [q, s, c] = await Promise.all([
      api<{ quotes: Quote[] }>("/api/quotes"),
      api<{ rows: Service[] }>("/api/services"),
      api<{ customers: Customer[] }>("/api/customers"),
    ]);
    setQuotes(q.quotes);
    setServices(s.rows);
    setCustomers(c.customers);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  // Deep-link from "create quote from lead": ?customerId=..&new=1
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      const cid = params.get("customerId");
      if (cid) setCustomerId(cid);
      setOpen(true);
    }
  }, []);

  const totals = calcQuote({ items, discount, taxRate, taxIncluded: false });

  function addService(id: string) {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    setItems((it) => [...it, { serviceId: s.id, name: s.name, quantity: 1, unitPrice: s.price }]);
  }

  async function save(status: "draft" | "sent") {
    if (!items.length) {
      toast("הוסף לפחות שירות אחד", "error");
      return;
    }
    setSaving(true);
    try {
      await api("/api/quotes", {
        method: "POST",
        body: { customerId: customerId || null, items, discount, taxRate, taxIncluded: false, status },
      });
      toast("הצעת מחיר נוצרה");
      setOpen(false);
      setItems([]);
      setCustomerId("");
      setDiscount(0);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    await api(`/api/quotes/${id}`, { method: "PATCH", body: { status } }).catch(() => {});
    load();
  }
  async function remove(id: string) {
    if (!confirm("למחוק הצעה זו?")) return;
    await api(`/api/quotes/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }
  function copyLink(token: string) {
    const url = `${window.location.origin}/quote/${token}`;
    navigator.clipboard?.writeText(url);
    toast("הקישור הועתק — שלח ללקוח");
  }

  return (
    <div>
      <PageHeader
        title="הצעות מחיר"
        subtitle="צור הצעות מעוצבות שהלקוח מאשר מהטלפון"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> הצעה חדשה
          </Button>
        }
      />

      {quotes === null ? (
        <LoadingScreen />
      ) : quotes.length === 0 ? (
        <EmptyState icon={FileText} title="אין הצעות מחיר" description="צור את ההצעה הראשונה שלך" action={<Button onClick={() => setOpen(true)}><Plus size={16} /> הצעה חדשה</Button>} />
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => (
            <Card key={q.id}>
              <CardContent className="flex flex-wrap items-center gap-3 pt-5">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">הצעה #{q.number}</p>
                    <Badge color={STATUS_COLOR[q.status]}>{STATUS_LABEL[q.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {q.customer?.name ?? "ללא לקוח"} · {formatDate(q.createdAt)} · {q.items.length} פריטים
                  </p>
                </div>
                <p className="text-lg font-bold">{formatMoney(q.total, currency)}</p>
                <div className="flex gap-1">
                  <button onClick={() => copyLink(q.publicToken)} title="העתק קישור" className="rounded p-2 text-muted-foreground hover:bg-secondary"><LinkIcon size={15} /></button>
                  {q.status === "draft" && (
                    <button onClick={() => setStatus(q.id, "sent")} title="סמן כנשלחה" className="rounded p-2 text-muted-foreground hover:bg-secondary"><Send size={15} /></button>
                  )}
                  <button onClick={() => remove(q.id)} className="rounded p-2 text-muted-foreground hover:bg-secondary"><Trash2 size={15} /></button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="הצעת מחיר חדשה" className="sm:max-w-xl">
        <div className="space-y-3">
          <div>
            <Label>לקוח</Label>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— ללא / לקוח מזדמן —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>הוסף שירות מהמחירון</Label>
            <Select value="" onChange={(e) => e.target.value && addService(e.target.value)}>
              <option value="">— בחר שירות —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} — {formatMoney(s.price, currency)}</option>
              ))}
            </Select>
          </div>

          {items.length > 0 && (
            <div className="space-y-2 rounded-lg border p-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{it.name}</span>
                  <Input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                    className="h-8 w-16"
                    dir="ltr"
                  />
                  <Input
                    type="number"
                    value={it.unitPrice}
                    onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))}
                    className="h-8 w-20"
                    dir="ltr"
                  />
                  <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>הנחה (₪)</Label>
              <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} dir="ltr" />
            </div>
            <div>
              <Label>מע"מ</Label>
              <Select value={String(taxRate)} onChange={(e) => setTaxRate(Number(e.target.value))}>
                <option value="0.17">17%</option>
                <option value="0">ללא מע"מ</option>
              </Select>
            </div>
          </div>

          <div className="rounded-lg bg-secondary p-3 text-sm">
            <div className="flex justify-between"><span>ביניים</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>מע"מ</span><span>{formatMoney(totals.taxAmount, currency)}</span></div>
            <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>סה"כ</span><span>{formatMoney(totals.total, currency)}</span></div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save("draft")} disabled={saving} className="flex-1">שמור טיוטה</Button>
            <Button onClick={() => save("sent")} disabled={saving} className="flex-1">צור ושלח</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
