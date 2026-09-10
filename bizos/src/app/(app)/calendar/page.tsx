"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/dialog";
import { LoadingScreen } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useBusiness } from "@/components/business-context";
import { api } from "@/lib/client";
import { formatMoney, addDays, startOfDay } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Plus, Trash2 } from "lucide-react";

type Job = {
  id: string;
  title: string;
  serviceName?: string | null;
  address?: string | null;
  price: number;
  status: string;
  startAt: string;
  customer?: { id: string; name: string } | null;
  employee?: { id: string; name: string } | null;
};
type Service = { id: string; name: string; price: number };
type Customer = { id: string; name: string };
type Employee = { id: string; name: string };

type View = "day" | "week" | "month";
const HEB_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const STATUS_COLOR: Record<string, string> = { scheduled: "blue", in_progress: "amber", done: "green", cancelled: "red" };

export default function CalendarPage() {
  const { config, currency } = useBusiness();
  const toast = useToast();
  const [view, setView] = React.useState<View>("week");
  const [anchor, setAnchor] = React.useState(() => startOfDay());
  const [jobs, setJobs] = React.useState<Job[] | null>(null);
  const [services, setServices] = React.useState<Service[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Job | null>(null);
  const [form, setForm] = React.useState<any>({});
  const [saving, setSaving] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);

  const range = React.useMemo(() => {
    if (view === "day") return { from: anchor, to: addDays(anchor, 1), days: [anchor] };
    if (view === "week") {
      const start = addDays(anchor, -anchor.getDay());
      return { from: start, to: addDays(start, 7), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    return { from: gridStart, to: addDays(gridStart, 42), days: Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)) };
  }, [view, anchor]);

  const load = React.useCallback(async () => {
    const data = await api<{ jobs: Job[] }>(`/api/jobs?from=${range.from.toISOString()}&to=${range.to.toISOString()}`);
    setJobs(data.jobs);
  }, [range.from, range.to]);
  React.useEffect(() => {
    load();
  }, [load]);
  React.useEffect(() => {
    Promise.all([
      api<{ rows: Service[] }>("/api/services"),
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ rows: Employee[] }>("/api/employees"),
    ]).then(([s, c, e]) => {
      setServices(s.rows);
      setCustomers(c.customers);
      setEmployees(e.rows);
    });
  }, []);

  function jobsOn(day: Date) {
    const next = addDays(day, 1);
    return (jobs ?? []).filter((j) => new Date(j.startAt) >= day && new Date(j.startAt) < next);
  }

  function openNew(day?: Date) {
    setEditing(null);
    const d = day ?? anchor;
    const dt = new Date(d);
    dt.setHours(9, 0, 0, 0);
    setForm({ startAt: toLocalInput(dt), price: 0, status: "scheduled" });
    setOpen(true);
  }
  function openEdit(j: Job) {
    setEditing(j);
    setForm({
      title: j.title,
      serviceName: j.serviceName ?? "",
      customerId: j.customer?.id ?? "",
      employeeId: j.employee?.id ?? "",
      address: j.address ?? "",
      price: j.price,
      status: j.status,
      startAt: toLocalInput(new Date(j.startAt)),
    });
    setOpen(true);
  }

  function pickService(id: string) {
    const s = services.find((x) => x.id === id);
    if (s) setForm((f: any) => ({ ...f, serviceName: s.name, title: f.title || s.name, price: s.price }));
  }

  async function save() {
    if (!form.title || !form.startAt) {
      toast("חסר שם או תאריך", "error");
      return;
    }
    setSaving(true);
    const body = {
      title: form.title,
      serviceName: form.serviceName || null,
      customerId: form.customerId || null,
      employeeId: form.employeeId || null,
      address: form.address || null,
      price: Number(form.price) || 0,
      status: form.status,
      startAt: new Date(form.startAt).toISOString(),
    };
    try {
      if (editing) await api(`/api/jobs/${editing.id}`, { method: "PATCH", body });
      else await api("/api/jobs", { method: "POST", body });
      toast(`${config.terminology.job} נשמרה`);
      setOpen(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing || !confirm("למחוק?")) return;
    await api(`/api/jobs/${editing.id}`, { method: "DELETE" }).catch(() => {});
    setOpen(false);
    load();
  }

  async function moveJob(id: string, day: Date) {
    const job = jobs?.find((j) => j.id === id);
    if (!job) return;
    const orig = new Date(job.startAt);
    const next = new Date(day);
    next.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
    setJobs((js) => js?.map((j) => (j.id === id ? { ...j, startAt: next.toISOString() } : j)) ?? null);
    await api(`/api/jobs/${id}`, { method: "PATCH", body: { startAt: next.toISOString() } }).catch(() => load());
  }

  const label =
    view === "month"
      ? anchor.toLocaleDateString("he-IL", { month: "long", year: "numeric" })
      : `${range.days[0].toLocaleDateString("he-IL", { day: "numeric", month: "short" })}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">יומן</h1>
          <div className="flex items-center rounded-lg border">
            <button onClick={() => setAnchor(addDays(anchor, view === "month" ? -30 : view === "week" ? -7 : -1))} className="p-2 hover:bg-secondary"><ChevronRight size={16} /></button>
            <button onClick={() => setAnchor(startOfDay())} className="px-2 text-sm hover:bg-secondary">היום</button>
            <button onClick={() => setAnchor(addDays(anchor, view === "month" ? 30 : view === "week" ? 7 : 1))} className="p-2 hover:bg-secondary"><ChevronLeft size={16} /></button>
          </div>
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5 text-sm">
            {(["day", "week", "month"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
                {v === "day" ? "יום" : v === "week" ? "שבוע" : "חודש"}
              </button>
            ))}
          </div>
          <Button onClick={() => openNew()}><Plus size={16} /> חדש</Button>
        </div>
      </div>

      {jobs === null ? (
        <LoadingScreen />
      ) : view === "day" ? (
        <DayColumn day={anchor} jobs={jobsOn(anchor)} onAdd={() => openNew(anchor)} onJob={openEdit} full currency={currency} />
      ) : view === "week" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {range.days.map((d) => (
            <div key={d.toISOString()} onDragOver={(e) => e.preventDefault()} onDrop={() => dragId && moveJob(dragId, d)}>
              <DayColumn day={d} jobs={jobsOn(d)} onAdd={() => openNew(d)} onJob={openEdit} onDragStart={setDragId} currency={currency} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1 text-sm">
          {HEB_DAYS.map((d) => (
            <div key={d} className="pb-1 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {range.days.map((d) => {
            const inMonth = d.getMonth() === anchor.getMonth();
            const items = jobsOn(d);
            const isToday = d.getTime() === startOfDay().getTime();
            return (
              <div
                key={d.toISOString()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && moveJob(dragId, d)}
                onClick={() => openNew(d)}
                className={`min-h-[76px] cursor-pointer rounded-lg border p-1 ${inMonth ? "bg-card" : "bg-secondary/40 text-muted-foreground"}`}
              >
                <span className={`text-xs ${isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</span>
                <div className="mt-0.5 space-y-0.5">
                  {items.slice(0, 3).map((j) => (
                    <div
                      key={j.id}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); setDragId(j.id); }}
                      onClick={(e) => { e.stopPropagation(); openEdit(j); }}
                      className={`truncate rounded px-1 text-[10px] text-white bg-${STATUS_COLOR[j.status]}-500`}
                      style={{ background: dotColor(j.status) }}
                    >
                      {j.title}
                    </div>
                  ))}
                  {items.length > 3 && <p className="text-[10px] text-muted-foreground">+{items.length - 3}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={editing ? `עריכת ${config.terminology.job}` : `${config.terminology.job} חדשה`}>
        <div className="space-y-3">
          <div>
            <Label>שירות מהמחירון</Label>
            <Select value="" onChange={(e) => e.target.value && pickService(e.target.value)}>
              <option value="">— בחר (אופציונלי) —</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>כותרת *</Label>
            <Input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>לקוח</Label>
              <Select value={form.customerId ?? ""} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                <option value="">—</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>{config.terminology.employee}</Label>
              <Select value={form.employeeId ?? ""} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">—</option>
                {employees.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>תאריך ושעה *</Label>
              <Input type="datetime-local" value={form.startAt ?? ""} onChange={(e) => setForm({ ...form, startAt: e.target.value })} dir="ltr" />
            </div>
            <div>
              <Label>מחיר (₪)</Label>
              <Input type="number" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} dir="ltr" />
            </div>
            <div>
              <Label>כתובת</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>סטטוס</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {config.jobStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            {editing && <Button variant="destructive" size="icon" onClick={remove}><Trash2 size={16} /></Button>}
            <Button onClick={save} disabled={saving} className="flex-1">{saving ? "שומר..." : "שמור"}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function DayColumn({
  day, jobs, onAdd, onJob, onDragStart, full, currency,
}: {
  day: Date;
  jobs: Job[];
  onAdd: () => void;
  onJob: (j: Job) => void;
  onDragStart?: (id: string) => void;
  full?: boolean;
  currency: string;
}) {
  const isToday = day.getTime() === startOfDay().getTime();
  return (
    <div className="rounded-xl border bg-card p-2">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
          {HEB_DAYS[day.getDay()]} {day.getDate()}/{day.getMonth() + 1}
        </span>
        <button onClick={onAdd} className="text-muted-foreground hover:text-foreground"><Plus size={14} /></button>
      </div>
      <div className={`space-y-1 ${full ? "" : "min-h-[80px]"}`}>
        {jobs.map((j) => (
          <div
            key={j.id}
            draggable={!!onDragStart}
            onDragStart={() => onDragStart?.(j.id)}
            onClick={() => onJob(j)}
            className="cursor-pointer rounded-lg border-r-2 bg-secondary/60 p-2 text-xs hover:bg-secondary"
            style={{ borderColor: dotColor(j.status) }}
          >
            <p className="font-medium">{new Date(j.startAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })} · {j.title}</p>
            {j.customer && <p className="text-muted-foreground">{j.customer.name}</p>}
            {full && j.price > 0 && <p className="text-muted-foreground">{formatMoney(j.price, currency)}</p>}
          </div>
        ))}
        {jobs.length === 0 && <p className="py-3 text-center text-[11px] text-muted-foreground">—</p>}
      </div>
    </div>
  );
}

function dotColor(status: string) {
  return { scheduled: "#3b82f6", in_progress: "#f59e0b", done: "#10b981", cancelled: "#ef4444" }[status] ?? "#6366f1";
}

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
