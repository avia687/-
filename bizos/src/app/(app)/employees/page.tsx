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
import { Plus, UserCog, Trash2, Phone, Mail, Link as LinkIcon } from "lucide-react";

type Employee = { id: string; name: string; phone?: string | null; role: string; title?: string | null; hourlyRate: number; active: boolean };
type Invite = { id: string; email: string; role: string; token: string };

export default function EmployeesPage() {
  const { config } = useBusiness();
  const toast = useToast();
  const [rows, setRows] = React.useState<Employee[] | null>(null);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [open, setOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [form, setForm] = React.useState<any>({ role: "EMPLOYEE", hourlyRate: 0, active: true });
  const [inviteForm, setInviteForm] = React.useState<any>({ role: "EMPLOYEE" });
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const [d, inv] = await Promise.all([
      api<{ rows: Employee[] }>("/api/employees"),
      api<{ invites: Invite[] }>("/api/invites").catch(() => ({ invites: [] })),
    ]);
    setRows(d.rows);
    setInvites(inv.invites);
  }, []);
  React.useEffect(() => {
    load();
  }, [load]);

  async function sendInvite() {
    if (!inviteForm.name || !inviteForm.email) return;
    setSaving(true);
    try {
      const { invite } = await api<{ invite: Invite }>("/api/invites", { method: "POST", body: inviteForm });
      const url = `${window.location.origin}/join/${invite.token}`;
      await navigator.clipboard?.writeText(url).catch(() => {});
      toast("ההזמנה נוצרה — הקישור הועתק");
      setInviteOpen(false);
      setInviteForm({ role: "EMPLOYEE" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }
  function copyInvite(token: string) {
    navigator.clipboard?.writeText(`${window.location.origin}/join/${token}`);
    toast("הקישור הועתק");
  }

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
      <PageHeader
        title={config.terminology.employees}
        subtitle="ניהול צוות והרשאות"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(true)}><Mail size={16} /> הזמן</Button>
            <Button onClick={() => setOpen(true)}><Plus size={16} /> {config.terminology.employee}</Button>
          </div>
        }
      />

      {invites.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-sm font-medium text-muted-foreground">הזמנות ממתינות</p>
          <div className="space-y-1">
            {invites.map((i) => (
              <Card key={i.id}>
                <CardContent className="flex items-center gap-2 py-3">
                  <Mail size={14} className="text-muted-foreground" />
                  <span className="flex-1 text-sm" dir="ltr">{i.email}</span>
                  <Badge color="amber">{ROLE_LABELS[i.role as Role] ?? i.role}</Badge>
                  <button onClick={() => copyInvite(i.token)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><LinkIcon size={14} /></button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

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

      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="הזמנת חבר צוות">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">נוצר קישור הצטרפות שתוכל לשלוח. המוזמן ייכנס עם ההרשאה שתבחר.</p>
          <div>
            <Label>שם *</Label>
            <Input value={inviteForm.name ?? ""} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
          </div>
          <div>
            <Label>אימייל *</Label>
            <Input type="email" value={inviteForm.email ?? ""} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} dir="ltr" />
          </div>
          <div>
            <Label>הרשאה</Label>
            <Select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}>
              {(["EMPLOYEE", "MANAGER", "ADMIN"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <Button onClick={sendInvite} disabled={saving || !inviteForm.name || !inviteForm.email} className="w-full">
            {saving ? "יוצר..." : "צור קישור הזמנה"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
