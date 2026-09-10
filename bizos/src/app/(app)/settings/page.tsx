"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { LoadingScreen } from "@/components/ui/states";
import { PageHeader } from "@/components/app/page-header";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { TEMPLATE_LIST } from "@/lib/business/templates";
import { isMessagingConnected } from "@/lib/messaging";
import { Building2, Type, Sparkles, Plug, CreditCard, Check, X } from "lucide-react";

type Data = {
  profile: any;
  defaultTerminology: Record<string, string>;
  plan: string;
  role: string;
};

const TERM_KEYS: { key: string; label: string }[] = [
  { key: "customer", label: "לקוח (יחיד)" },
  { key: "customers", label: "לקוחות (רבים)" },
  { key: "lead", label: "ליד" },
  { key: "job", label: "עבודה" },
  { key: "jobs", label: "עבודות" },
  { key: "employee", label: "עובד" },
];

const TABS = [
  { key: "business", label: "עסק", icon: Building2 },
  { key: "terminology", label: "מינוחים", icon: Type },
  { key: "ai", label: "AI", icon: Sparkles },
  { key: "integrations", label: "אינטגרציות", icon: Plug },
  { key: "subscription", label: "מנוי", icon: CreditCard },
];

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState("business");
  const [data, setData] = React.useState<Data | null>(null);
  const [form, setForm] = React.useState<any>({});
  const [terms, setTerms] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    api<Data>("/api/settings").then((d) => {
      setData(d);
      setForm(d.profile);
      setTerms(d.profile.terminologyOverrides ?? {});
    });
  }, []);

  async function save(patch: any) {
    setSaving(true);
    try {
      await api("/api/settings", { method: "PATCH", body: patch });
      toast("נשמר");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "שגיאה", "error");
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <LoadingScreen />;

  return (
    <div>
      <PageHeader title="הגדרות" subtitle="נהל את פרטי העסק, מינוחים ואינטגרציות" />

      <div className="mb-4 flex gap-1 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "business" && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>שם העסק</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>שם בעל העסק</Label>
                <Input value={form.ownerName ?? ""} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
              </div>
              <div>
                <Label>סוג העסק</Label>
                <Select value={form.businessType ?? "generic"} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
                  <option value="generic">כללי</option>
                  {TEMPLATE_LIST.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                </Select>
              </div>
              <div>
                <Label>מטבע</Label>
                <Select value={form.currency ?? "ILS"} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  <option value="ILS">₪ שקל</option>
                  <option value="USD">$ דולר</option>
                  <option value="EUR">€ אירו</option>
                </Select>
              </div>
              <div>
                <Label>טלפון</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp ?? ""} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label>צבע מותג</Label>
                <input type="color" value={form.brandColor ?? "#4f46e5"} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="h-10 w-full rounded-lg border" />
              </div>
              <div>
                <Label>אזורי שירות</Label>
                <Input value={form.serviceAreas ?? ""} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>כתובת</Label>
                <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            <Button onClick={() => save({ name: form.name, ownerName: form.ownerName, businessType: form.businessType, currency: form.currency, phone: form.phone, whatsapp: form.whatsapp, brandColor: form.brandColor, serviceAreas: form.serviceAreas, address: form.address })} disabled={saving}>
              שמור שינויים
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "terminology" && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-sm text-muted-foreground">התאם את המילים שהמערכת משתמשת בהן לעסק שלך. השאר ריק כדי להשתמש בברירת המחדל.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TERM_KEYS.map((t) => (
                <div key={t.key}>
                  <Label>{t.label}</Label>
                  <Input
                    value={terms[t.key] ?? ""}
                    placeholder={data.defaultTerminology[t.key]}
                    onChange={(e) => setTerms({ ...terms, [t.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => save({ terminologyOverrides: Object.fromEntries(Object.entries(terms).filter(([, v]) => v)) })} disabled={saving}>
              שמור מינוחים
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "ai" && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <Label>הוראות ל-AI</Label>
              <Textarea
                value={form.aiInstructions ?? ""}
                onChange={(e) => setForm({ ...form, aiInstructions: e.target.value })}
                placeholder="לדוגמה: תמיד הצע שדרוג לחבילה שנתית, שמור על טון ידידותי..."
                className="min-h-[120px]"
              />
              <p className="mt-1 text-xs text-muted-foreground">ה-AI תמיד משתמש בנתוני העסק האמיתיים ולא ממציא מחירים.</p>
            </div>
            <Button onClick={() => save({ aiInstructions: form.aiInstructions })} disabled={saving}>שמור</Button>
          </CardContent>
        </Card>
      )}

      {tab === "integrations" && (
        <div className="space-y-2">
          <IntegrationRow name="WhatsApp Business API" connected={isMessagingConnected()} note="שליחת הודעות אוטומטית ללקוחות" />
          <IntegrationRow name="סליקת אשראי (Stripe)" connected={false} note="גביית תשלומים אונליין" />
          <IntegrationRow name="Google Calendar" connected={false} note="סנכרון יומן" />
          <IntegrationRow name="SMS" connected={false} note="שליחת תזכורות" />
          <p className="pt-2 text-xs text-muted-foreground">האינטגרציות בנויות עם ממשק מוכן — חיבור ספק אמיתי מתבצע בהגדרת מפתחות ה-API בשרת.</p>
        </div>
      )}

      {tab === "subscription" && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm">התוכנית הנוכחית שלך: <span className="font-bold">{data.plan.toUpperCase()}</span></p>
            <p className="mt-1 text-sm text-muted-foreground">ניהול מנויים וחיוב יתווסף בעתיד (הארכיטקטורה מוכנה ל-Stripe).</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IntegrationRow({ name, connected, note }: { name: string; connected: boolean; note: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex-1">
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1 text-sm text-green-600"><Check size={15} /> מחובר</span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-muted-foreground"><X size={15} /> לא מחובר</span>
        )}
      </CardContent>
    </Card>
  );
}
