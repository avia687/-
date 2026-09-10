"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Textarea, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/utils";
import { Plus, Tag, Clock, Pencil, Trash2 } from "lucide-react";

type Service = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
  cost: number;
  durationMin: number;
  active: boolean;
};

export default function ServicesPage() {
  const { config, currency } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Service[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Service | null>(null);
  const [form, setForm] = React.useState<Partial<Service>>({ price: 0, cost: 0, durationMin: 60, active: true });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const data = await api<{ rows: Service[] }>("/api/services");
    setRows(data.rows);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ price: 0, cost: 0, durationMin: 60, active: true });
    setOpen(true);
  }
  function openEdit(s: Service) {
    setEditing(s);
    setForm(s);
    setOpen(true);
  }

  async function save() {
    if (!form.name) return;
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description,
      category: form.category,
      price: Number(form.price) || 0,
      cost: Number(form.cost) || 0,
      durationMin: Number(form.durationMin) || 0,
      active: form.active ?? true,
    };
    try {
      if (editing) await api(`/api/services/${editing.id}`, { method: "PATCH", body });
      else await api("/api/services", { method: "POST", body });
      toast(`${config.terminology.service} נשמר`);
      setOpen(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("למחוק שירות זה?")) return;
    await api(`/api/services/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div>
      <PageHeader
        title={config.terminology.services}
        subtitle="המחירון שלך — משמש בהצעות מחיר, עבודות וב-AI"
        action={
          <Button onClick={openNew}>
            <Plus size={16} /> {config.terminology.service} חדש
          </Button>
        }
      />

      {rows === null ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState icon={Tag} title="המחירון ריק" description="הוסף את השירות הראשון" action={<Button onClick={openNew}><Plus size={16} /> הוסף</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => {
            const profit = s.price - s.cost;
            return (
              <Card key={s.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      {s.category && <Badge color="indigo" className="mt-1">{s.category}</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(s)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><Pencil size={14} /></button>
                      <button onClick={() => remove(s.id)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {s.description && <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>}
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p className="text-lg font-bold">{formatMoney(s.price, currency)}</p>
                      <p className="text-[11px] text-muted-foreground">רווח: {formatMoney(profit, currency)}</p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock size={12} /> {s.durationMin} דק'</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "עריכת שירות" : `${config.terminology.service} חדש`}>
        <div className="space-y-3">
          <div>
            <Label>שם *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>תיאור</Label>
            <Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>קטגוריה</Label>
              <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label>משך (דקות)</Label>
              <Input type="number" value={form.durationMin ?? 60} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} dir="ltr" />
            </div>
            <div>
              <Label>מחיר (₪)</Label>
              <Input type="number" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} dir="ltr" />
            </div>
            <div>
              <Label>עלות (₪)</Label>
              <Input type="number" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} dir="ltr" />
            </div>
          </div>
          <Button onClick={save} disabled={saving || !form.name} className="w-full">
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
