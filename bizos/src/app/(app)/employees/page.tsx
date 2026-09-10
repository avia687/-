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
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { Plus, UserCog, Trash2, Phone } from "lucide-react";

type Employee = { id: string; name: string; phone?: string | null; role: string; title?: string | null; hourlyRate: number; active: boolean };

export default function EmployeesPage() {
  const { config } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Employee[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({ role: "EMPLOYEE", hourlyRate: 0, active: true });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const d = await api<{ rows: Employee[] }>("/api/employees");
    setRows(d.rows);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!form.name) return;
    setSaving(true);
    try {
      await api("/api/employees", { method: "POST", body: { name: form.name, phone: form.phone, role: form.role, title: form.title, hourlyRate: Number(form.hourlyRate) || 0 } });
      toast(`${config.terminology.employee} נוסף`);
      setOpen(false);
      setForm({ role: "EMPLOYEE", hourlyRate: 0, active: true });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    if (!confirm("למחוק?")) return;
    await api(`/api/employees/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div>
      <PageHeader title={config.terminology.employees} subtitle="ניהול צוות והרשאות" action={<Button onClick={() => setOpen(true)}><Plus size={16} /> {config.terminology.employee} חדש</Button>} />

      {rows === null ? (
        <LoadingScreen />
      ) : rows.length === 0 ? (
        <EmptyState icon={UserCog} title={`אין ${config.terminology.employees}`} description="הוסף חבר צוות" action={<Button onClick={() => setOpen(true)}><Plus size={16} /> הוסף</Button>} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex items-center gap-3 pt-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground">{e.name.charAt(0)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.title || "—"}</p>
                  {e.phone && <p className="flex items-center gap-1 text-xs text-muted-foreground" dir="ltr"><Phone size={10} /> {e.phone}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge color="indigo">{ROLE_LABELS[e.role as Role] ?? e.role}</Badge>
                  <button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={`${config.terminology.employee} חדש`}>
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
              <Label>תפקיד (תיאור)</Label>
              <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>הרשאה</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {(["EMPLOYEE", "MANAGER", "ADMIN"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </div>
            <div>
              <Label>שכר לשעה (₪)</Label>
              <Input type="number" value={form.hourlyRate ?? 0} onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })} dir="ltr" />
            </div>
          </div>
          <Button onClick={save} disabled={saving || !form.name} className="w-full">{saving ? "שומר..." : "שמור"}</Button>
        </div>
      </Dialog>
    </div>
  );
}
