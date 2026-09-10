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
import { Plus, Receipt, Trash2 } from "lucide-react";

type Expense = { id: string; category: string; description?: string | null; amount: number; spentAt: string };

const CATEGORIES: Record<string, string> = {
  fuel: "דלק", equipment: "ציוד", materials: "חומרים", payroll: "עובדים",
  ads: "פרסום", rent: "שכירות", utilities: "חשמל/מים", other: "אחר",
};

export default function ExpensesPage() {
  const { currency } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Expense[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({ category: "materials", amount: 0 });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const d = await api<{ rows: Expense[] }>("/api/expenses");
    setRows(d.rows);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  const total = (rows ?? []).reduce((a, e) => a + e.amount, 0);

  async function save() {
    setSaving(true);
    try {
      await api("/api/expenses", { method: "POST", body: { category: form.category, description: form.description, amount: Number(form.amount) || 0 } });
      toast("הוצאה נרשמה");
      setOpen(false);
      setForm({ category: "materials", amount: 0 });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    await api(`/api/expenses/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div>
      <PageHeader title="הוצאות" subtitle={`סה"כ: ${formatMoney(total, currency)}`} action={<Button onClick={() => setOpen(true)}><Plus size={16} /> הוצאה</Button>} />

      {rows === null ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState icon={Receipt} title="אין הוצאות" description="רשום את ההוצאה הראשונה" action={<Button onClick={() => setOpen(true)}><Plus size={16} /> הוצאה</Button>} />
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-center gap-3 pt-5">
                <div className="flex-1">
                  <p className="font-medium">{e.description || CATEGORIES[e.category]}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(e.spentAt)}</p>
                </div>
                <Badge color="violet">{CATEGORIES[e.category] ?? e.category}</Badge>
                <p className="font-bold text-red-600">{formatMoney(e.amount, currency)}</p>
                <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="הוצאה חדשה">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>קטגוריה</Label>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>סכום (₪)</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} dir="ltr" />
            </div>
          </div>
          <div>
            <Label>תיאור</Label>
            <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <Button onClick={save} disabled={saving} className="w-full">{saving ? "שומר..." : "שמור"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
