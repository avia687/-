"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { Plus, Users, Phone, Search, Pencil, Trash2 } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

export default function CustomersPage() {
  const { config } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Customer[] | null>(null);
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [form, setForm] = React.useState<Partial<Customer>>({});
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async (search = "") => {
    const data = await api<{ customers: Customer[] }>(`/api/customers?q=${encodeURIComponent(search)}`);
    setRows(data.customers);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    const id = setTimeout(() => load(q), 250);
    return () => clearTimeout(id);
  }, [q, load]);

  function openNew() {
    setEditing(null);
    setForm({});
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm(c);
    setOpen(true);
  }

  async function save() {
    if (!form.name) return;
    setSaving(true);
    try {
      if (editing) await api(`/api/customers/${editing.id}`, { method: "PATCH", body: form });
      else await api("/api/customers", { method: "POST", body: form });
      toast(editing ? "עודכן" : `${config.terminology.customer} נוסף`);
      setOpen(false);
      setForm({});
      setEditing(null);
      load(q);
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Customer) {
    if (!confirm(`למחוק את ${c.name}?`)) return;
    try {
      await api(`/api/customers/${c.id}`, { method: "DELETE" });
      toast("נמחק");
      load(q);
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    }
  }

  return (
    <div>
      <PageHeader
        title={config.terminology.customers}
        subtitle="ניהול כל הלקוחות שלך במקום אחד"
        action={
          <Button onClick={openNew}>
            <Plus size={16} /> {config.terminology.customer} חדש
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 sm:max-w-xs">
        <Search size={16} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש..."
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {rows === null ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={`אין ${config.terminology.customers} עדיין`}
          description="הוסף את הלקוח הראשון שלך כדי להתחיל"
          action={
            <Button onClick={openNew}>
              <Plus size={16} /> הוסף {config.terminology.customer}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-3">
                <Link href={`/customers/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    {c.phone && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Phone size={11} /> {c.phone}
                      </p>
                    )}
                  </div>
                </Link>
                <button onClick={() => openEdit(c)} aria-label="ערוך" className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><Pencil size={14} /></button>
                <button onClick={() => remove(c)} aria-label="מחק" className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><Trash2 size={14} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? "עריכת פרטים" : `${config.terminology.customer} חדש`}>
        <div className="space-y-3">
          <div>
            <Label>שם *</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>טלפון</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
            </div>
            <div>
              <Label>אימייל</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
            </div>
          </div>
          <div>
            <Label>כתובת</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label>הערות</Label>
            <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button onClick={save} disabled={saving || !form.name} className="w-full">
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
