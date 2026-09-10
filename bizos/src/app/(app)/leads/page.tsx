"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Select, Textarea, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/utils";
import { Plus } from "lucide-react";

type Lead = {
  id: string;
  title: string;
  contactName?: string | null;
  contactPhone?: string | null;
  source?: string | null;
  status: string;
  value: number;
  probability: number;
  notes?: string | null;
};

export default function LeadsPage() {
  const { config, currency } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Lead[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Partial<Lead>>({ status: "new", probability: 50, value: 0 });
  const [saving, setSaving] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const data = await api<{ rows: Lead[] }>("/api/leads");
    setRows(data.rows);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form.title) return;
    setSaving(true);
    try {
      await api("/api/leads", {
        method: "POST",
        body: {
          title: form.title,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          source: form.source,
          status: form.status ?? "new",
          value: Number(form.value) || 0,
          probability: Number(form.probability) || 50,
          notes: form.notes,
        },
      });
      toast(`${config.terminology.lead} נוסף`);
      setOpen(false);
      setForm({ status: "new", probability: 50, value: 0 });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function moveTo(id: string, status: string) {
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, status } : r)) ?? null);
    try {
      await api(`/api/leads/${id}`, { method: "PATCH", body: { status } });
    } catch {
      toast("שגיאה בעדכון", "error");
      load();
    }
  }

  if (rows === null) return <LoadingScreen />;

  return (
    <div>
      <PageHeader
        title={config.terminology.leads}
        subtitle="גרור לידים בין השלבים לניהול תהליך המכירה"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {config.terminology.lead} חדש
          </Button>
        }
      />

      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
        {config.leadStatuses.map((col) => {
          const items = rows.filter((r) => r.status === col.key);
          const total = items.reduce((a, l) => a + l.value, 0);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dragId && moveTo(dragId, col.key)}
              className="w-64 shrink-0"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Badge color={col.color}>{col.label}</Badge>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatMoney(total, currency)}</span>
              </div>
              <div className="space-y-2 rounded-xl bg-secondary/50 p-2">
                {items.map((l) => (
                  <Card
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    className="cursor-grab p-3 active:cursor-grabbing"
                  >
                    <p className="text-sm font-medium">{l.title}</p>
                    {l.contactName && <p className="text-xs text-muted-foreground">{l.contactName}</p>}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs font-medium">{formatMoney(l.value, currency)}</span>
                      <span className="text-xs text-muted-foreground">{l.probability}%</span>
                    </div>
                    {l.source && <p className="mt-1 text-[11px] text-muted-foreground">מקור: {l.source}</p>}
                  </Card>
                ))}
                {items.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">גרור לכאן</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={`${config.terminology.lead} חדש`}>
        <div className="space-y-3">
          <div>
            <Label>כותרת / תיאור *</Label>
            <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>שם איש קשר</Label>
              <Input value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={form.contactPhone ?? ""} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} dir="ltr" />
            </div>
            <div>
              <Label>שווי משוער (₪)</Label>
              <Input type="number" value={form.value ?? 0} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} dir="ltr" />
            </div>
            <div>
              <Label>סיכוי סגירה (%)</Label>
              <Input type="number" value={form.probability ?? 50} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} dir="ltr" />
            </div>
            <div>
              <Label>מקור</Label>
              <Input value={form.source ?? ""} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="פייסבוק, המלצה..." />
            </div>
            <div>
              <Label>שלב</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {config.leadStatuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button onClick={save} disabled={saving || !form.title} className="w-full">
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
