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
import { formatMoney, formatDate } from "@/lib/utils";
import { METHOD_LABELS, STATUS_LABELS } from "@/lib/payments";
import { Plus, Wallet } from "lucide-react";

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
  customer?: { name: string } | null;
};
type Customer = { id: string; name: string };

const STATUS_COLOR: Record<string, string> = { paid: "green", pending: "amber", partial: "blue", overdue: "red" };

export default function PaymentsPage() {
  const { currency } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Payment[] | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({ method: "cash", status: "paid", amount: 0 });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const [p, c] = await Promise.all([
      api<{ payments: Payment[] }>("/api/payments"),
      api<{ customers: Customer[] }>("/api/customers"),
    ]);
    setRows(p.payments);
    setCustomers(c.customers);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const totals = React.useMemo(() => {
    const paid = (rows ?? []).filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
    const open = (rows ?? []).filter((p) => p.status !== "paid").reduce((a, p) => a + p.amount, 0);
    return { paid, open };
  }, [rows]);

  async function save() {
    setSaving(true);
    try {
      await api("/api/payments", {
        method: "POST",
        body: { customerId: form.customerId || null, amount: Number(form.amount) || 0, method: form.method, status: form.status, notes: form.notes },
      });
      toast("תשלום נרשם");
      setOpen(false);
      setForm({ method: "cash", status: "paid", amount: 0 });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: Payment) {
    const status = p.status === "paid" ? "pending" : "paid";
    await api(`/api/payments/${p.id}`, { method: "PATCH", body: { status } }).catch(() => {});
    load();
  }

  return (
    <div>
      <PageHeader title="תשלומים" subtitle="מעקב אחר הכנסות ותשלומים פתוחים" action={<Button onClick={() => setOpen(true)}><Plus size={16} /> תשלום</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">התקבל</p><p className="text-xl font-bold text-green-600">{formatMoney(totals.paid, currency)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">ממתין / חוב</p><p className="text-xl font-bold text-red-600">{formatMoney(totals.open, currency)}</p></CardContent></Card>
      </div>

      {rows === null ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="אין תשלומים" description="רשום את התשלום הראשון" action={<Button onClick={() => setOpen(true)}><Plus size={16} /> תשלום</Button>} />
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center gap-3 pt-5">
                <div className="flex-1">
                  <p className="font-semibold">{formatMoney(p.amount, currency)}</p>
                  <p className="text-xs text-muted-foreground">{p.customer?.name ?? "כללי"} · {METHOD_LABELS[p.method as keyof typeof METHOD_LABELS]} · {formatDate(p.createdAt)}</p>
                </div>
                <button onClick={() => toggle(p)}>
                  <Badge color={STATUS_COLOR[p.status]}>{STATUS_LABELS[p.status as keyof typeof STATUS_LABELS]}</Badge>
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="תשלום חדש">
        <div className="space-y-3">
          <div>
            <Label>לקוח</Label>
            <Select value={form.customerId ?? ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">— כללי —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>סכום (₪)</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} dir="ltr" />
            </div>
            <div>
              <Label>אמצעי</Label>
              <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>סטטוס</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          <Button onClick={save} disabled={saving} className="w-full">{saving ? "שומר..." : "שמור"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
